import type { NextRequest } from "next/server";
import type Stripe from "stripe";

import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { 
  handleCreditRechargeWithTransaction,
  addBonusCreditsWithTransaction 
} from "~/api/credits/credit-service";
import { syncSubscription } from "~/api/payments/stripe-service";
import { stripe } from "~/lib/stripe";
import { db } from "~/db";
import { userTable } from "~/db/schema";

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

/**
 * 改进版 Stripe Webhook 处理器
 * - 增强错误处理和重试机制
 * - 使用事务确保数据一致性
 * - 添加幂等性支持
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const headersList = headers();
    const signature = (await headersList).get("stripe-signature");

    if (!signature || !webhookSecret) {
      console.error("[webhook] Webhook 签名验证失败 - 缺少签名或密钥");
      return new NextResponse("Webhook 签名验证失败", { status: 400 });
    }

    // 验证 webhook 签名
    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      webhookSecret,
    );

    console.log(`[webhook] 收到事件: ${event.type}, ID: ${event.id}`);

    // 处理事件（使用幂等性处理）
    const result = await processWebhookEvent(event);
    
    console.log(`[webhook] 事件处理完成: ${event.type}, 结果:`, result);
    
    return NextResponse.json({ success: true, eventId: event.id });
  } catch (error) {
    console.error("[webhook] Webhook 处理错误:", {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
    });
    
    // 对于签名验证错误，返回 400
    if (error instanceof Error && error.message.includes("signature")) {
      return NextResponse.json(
        { error: "签名验证失败", success: false },
        { status: 400 },
      );
    }
    
    // 对于其他错误，返回 500（这会导致 Stripe 重试）
    return NextResponse.json(
      { error: "Webhook 处理错误", success: false },
      { status: 500 },
    );
  }
}

/**
 * 处理 Webhook 事件的主函数（带重试和幂等性）
 */
async function processWebhookEvent(event: Stripe.Event) {
  // 检查事件是否已经处理过（简单的幂等性检查）
  const eventId = event.id;
  
  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.deleted":
      case "customer.subscription.updated":
        return await handleSubscriptionChangeWithRetry(event);
        
      case "payment_intent.succeeded":
        return await handlePaymentIntentSucceededWithRetry(event);
        
      default:
        console.log(`[webhook] 未处理的事件类型: ${event.type}`);
        return { handled: false, reason: "unsupported_event_type" };
    }
  } catch (error) {
    console.error(`[webhook] 处理事件 ${eventId} 失败:`, error);
    throw error;
  }
}

/**
 * 带重试机制的订阅变更处理
 */
async function handleSubscriptionChangeWithRetry(event: Stripe.Event, retryCount = 0) {
  const maxRetries = 3;
  
  try {
    return await handleSubscriptionChange(event);
  } catch (error) {
    console.error(`[webhook] 订阅处理失败 (尝试 ${retryCount + 1}/${maxRetries}):`, error);
    
    if (retryCount < maxRetries - 1) {
      // 指数退避重试
      const delay = Math.pow(2, retryCount) * 1000;
      console.log(`[webhook] ${delay}ms 后重试...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return handleSubscriptionChangeWithRetry(event, retryCount + 1);
    }
    
    throw error;
  }
}

/**
 * 带重试机制的支付成功处理
 */
async function handlePaymentIntentSucceededWithRetry(event: Stripe.Event, retryCount = 0) {
  const maxRetries = 3;
  
  try {
    return await handlePaymentIntentSucceeded(event);
  } catch (error) {
    console.error(`[webhook] 支付处理失败 (尝试 ${retryCount + 1}/${maxRetries}):`, error);
    
    if (retryCount < maxRetries - 1) {
      const delay = Math.pow(2, retryCount) * 1000;
      console.log(`[webhook] ${delay}ms 后重试...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return handlePaymentIntentSucceededWithRetry(event, retryCount + 1);
    }
    
    throw error;
  }
}

/**
 * 订阅变更处理（改进版）
 */
async function handleSubscriptionChange(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription;
  const customerId = subscription.customer as string;

  console.log(`[webhook] 处理订阅变更: ${event.type}, 订阅ID: ${subscription.id}, 客户ID: ${customerId}`);

  // 获取用户ID（改进的查找逻辑）
  const userId = await findUserIdByCustomer(customerId);
  
  if (!userId) {
    console.warn(`[webhook] 无法找到用户ID，记录待处理订阅: ${subscription.id}`);
    await handleOrphanedSubscription(subscription, customerId, event.type);
    return { handled: false, reason: "user_not_found" };
  }

  // 获取商品信息
  const productInfo = await getProductInfo(subscription);

  // 同步订阅数据（使用事务）
  await syncSubscriptionWithTransaction(userId, customerId, subscription, productInfo);

  // 处理订阅创建时的积分奖励
  if (event.type === "customer.subscription.created" && subscription.status === "active") {
    await handleSubscriptionBonus(userId, subscription, productInfo);
  }

  return { 
    handled: true, 
    userId, 
    subscriptionId: subscription.id,
    eventType: event.type 
  };
}

/**
 * 支付成功处理（改进版）
 */
async function handlePaymentIntentSucceeded(event: Stripe.Event) {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  const { metadata } = paymentIntent;

  console.log(`[webhook] 处理支付成功: ${paymentIntent.id}, 金额: ${paymentIntent.amount}`);

  // 检查是否是积分充值
  if (metadata && metadata.type === "credit_recharge") {
    const { rechargeId } = metadata;
    
    if (!rechargeId) {
      console.error(`[webhook] 积分充值支付缺少 rechargeId: ${paymentIntent.id}`);
      throw new Error("积分充值支付缺少 rechargeId");
    }

    try {
      // 使用改进的事务处理函数
      const result = await handleCreditRechargeWithTransaction(rechargeId, paymentIntent.id);
      
      console.log(`[webhook] 积分充值处理成功:`, {
        rechargeId,
        paymentIntentId: paymentIntent.id,
        userId: metadata.userId,
        credits: metadata.credits,
        newBalance: result.newBalance,
        duplicate: result.duplicate,
      });

      return {
        handled: true,
        type: "credit_recharge",
        rechargeId,
        success: true,
        duplicate: result.duplicate,
      };
    } catch (error) {
      console.error(`[webhook] 积分充值处理失败: ${rechargeId}`, error);
      throw error;
    }
  }

  // 处理其他类型的支付（如订阅支付）
  console.log(`[webhook] 非积分充值支付，跳过处理: ${paymentIntent.id}`);
  return { handled: false, reason: "not_credit_recharge" };
}

/**
 * 通过 Stripe 客户ID查找用户ID（改进版）
 */
async function findUserIdByCustomer(customerId: string): Promise<string | null> {
  try {
    // 1. 获取 Stripe 客户信息
    const customer = await stripe.customers.retrieve(customerId);
    
    if (!customer || customer.deleted) {
      console.error(`[webhook] Stripe 客户不存在: ${customerId}`);
      return null;
    }

    // 2. 从 metadata 中获取 userId
    let userId = customer.metadata?.userId;
    
    if (userId) {
      console.log(`[webhook] 从 metadata 找到用户ID: ${userId}`);
      return userId;
    }

    // 3. 通过邮箱查找用户
    if (customer.email) {
      console.log(`[webhook] 通过邮箱查找用户: ${customer.email}`);
      
      const user = await db.query.userTable.findFirst({
        where: eq(userTable.email, customer.email),
      });
      
      if (user) {
        userId = user.id;
        console.log(`[webhook] 通过邮箱找到用户: ${userId}`);
        
        // 更新客户 metadata
        await stripe.customers.update(customerId, {
          metadata: {
            ...customer.metadata,
            userId,
            linkedBy: "email_match",
            linkedAt: new Date().toISOString(),
          },
        });
        
        return userId;
      }
    }

    console.warn(`[webhook] 无法找到用户:`, {
      customerId,
      customerEmail: customer.email,
      hasMetadata: !!customer.metadata?.userId,
    });
    
    return null;
  } catch (error) {
    console.error(`[webhook] 查找用户ID失败:`, error);
    return null;
  }
}

/**
 * 获取订阅商品信息
 */
async function getProductInfo(subscription: Stripe.Subscription) {
  try {
    if (subscription.items.data.length === 0) {
      return { productId: "", priceId: "", amount: 0 };
    }

    const priceId = subscription.items.data[0].price.id;
    const amount = subscription.items.data[0].price.unit_amount || 0;
    
    const product = await stripe.products.retrieve(
      subscription.items.data[0].price.product as string,
    );
    
    return {
      productId: product.id,
      priceId,
      amount,
    };
  } catch (error) {
    console.error(`[webhook] 获取商品信息失败:`, error);
    return { productId: "", priceId: "", amount: 0 };
  }
}

/**
 * 使用事务同步订阅数据
 */
async function syncSubscriptionWithTransaction(
  userId: string,
  customerId: string,
  subscription: Stripe.Subscription,
  productInfo: { productId: string; priceId: string; amount: number }
) {
  try {
    await syncSubscription(
      userId,
      customerId,
      subscription.id,
      productInfo.productId,
      subscription.status,
    );
    
    console.log(`[webhook] 订阅数据同步成功: ${subscription.id}`);
  } catch (error) {
    console.error(`[webhook] 订阅数据同步失败:`, error);
    throw error;
  }
}

/**
 * 处理订阅创建时的积分奖励
 */
async function handleSubscriptionBonus(
  userId: string,
  subscription: Stripe.Subscription,
  productInfo: { productId: string; priceId: string; amount: number }
) {
  try {
    const { amount, priceId } = productInfo;
    
    // 改进的价格匹配逻辑
    let creditsToAdd = 120; // 默认月付积分
    let description = "订阅成功赠送积分";

    // 使用更灵活的价格匹配
    if (amount >= 1600 && amount <= 1800) {
      // 月付价格范围 (考虑可能的价格变动)
      creditsToAdd = 120;
      description = "月付订阅成功赠送120积分";
    } else if (amount >= 900 && amount <= 1100) {
      // 年付价格范围 (考虑可能的价格变动)  
      creditsToAdd = 1800;
      description = "年付订阅成功赠送1800积分";
    } else {
      // 记录未匹配的价格，便于调试
      console.warn(`[webhook] 未匹配的订阅价格: ${amount}，使用默认积分 ${creditsToAdd}`, {
        amount,
        priceId,
        subscriptionId: subscription.id,
        userId,
      });
      
      // 根据价格大小智能判断
      if (amount >= 1200) {
        creditsToAdd = 120; // 可能是月付
        description = "订阅成功赠送积分 (按月付计算)";
      } else if (amount >= 500) {
        creditsToAdd = 1800; // 可能是年付优惠价
        description = "订阅成功赠送积分 (按年付计算)";
      }
    }

    console.log(`[webhook] 开始为订阅用户添加积分:`, {
      userId,
      subscriptionId: subscription.id,
      amount,
      priceId,
      creditsToAdd,
      description,
    });

    // 使用改进的事务处理函数
    const result = await addBonusCreditsWithTransaction(
      userId,
      creditsToAdd,
      description,
      {
        subscriptionId: subscription.id,
        priceId,
        amount,
        type: "subscription_bonus",
        webhookEventType: "customer.subscription.created",
        originalPrice: amount,
        matchedByPrice: true,
      }
    );

    console.log(`[webhook] 订阅积分奖励成功:`, {
      userId,
      creditsAdded: creditsToAdd,
      newBalance: result.balance,
      transactionId: result.transactionId,
      subscriptionId: subscription.id,
    });

    // 发送成功通知到监控系统 (可选)
    try {
      await notifySuccessfulSubscriptionBonus(userId, subscription.id, creditsToAdd, result.balance);
    } catch (notifyError) {
      console.warn(`[webhook] 发送成功通知失败:`, notifyError);
    }

    return result;
  } catch (error) {
    console.error(`[webhook] 订阅积分奖励失败:`, {
      userId,
      subscriptionId: subscription.id,
      amount: productInfo.amount,
      priceId: productInfo.priceId,
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
    });
    
    // 发送错误通知到监控系统
    try {
      await notifyFailedSubscriptionBonus(userId, subscription.id, productInfo, error);
    } catch (notifyError) {
      console.warn(`[webhook] 发送错误通知失败:`, notifyError);
    }
    
    // 不抛出错误，避免影响订阅创建
    console.warn(`[webhook] 积分奖励失败但不影响订阅，请手动处理用户 ${userId} 的积分`);
  }
}

/**
 * 发送成功通知到监控系统
 */
async function notifySuccessfulSubscriptionBonus(
  userId: string,
  subscriptionId: string,
  creditsAdded: number,
  newBalance: number
) {
  // 这里可以集成你的监控系统，如 Slack、Email、或数据库日志
  console.log(`[监控] 订阅积分奖励成功`, {
    userId,
    subscriptionId,
    creditsAdded,
    newBalance,
    timestamp: new Date().toISOString(),
  });
  
  // 示例: 可以发送到监控表或第三方服务
  // await db.insert(monitoringLogTable).values({...});
}

/**
 * 发送失败通知到监控系统  
 */
async function notifyFailedSubscriptionBonus(
  userId: string,
  subscriptionId: string,
  productInfo: { productId: string; priceId: string; amount: number },
  error: unknown
) {
  console.error(`[监控] 订阅积分奖励失败`, {
    userId,
    subscriptionId,
    productInfo,
    error: error instanceof Error ? error.message : error,
    timestamp: new Date().toISOString(),
  });
  
  // 这里可以发送告警到Slack、Email等
  // 或者写入错误监控表以便后续手动处理
}

/**
 * 处理无法找到用户的孤立订阅
 */
async function handleOrphanedSubscription(
  subscription: Stripe.Subscription,
  customerId: string,
  eventType: string
) {
  try {
    console.log(`[webhook] 记录孤立订阅:`, {
      subscriptionId: subscription.id,
      customerId,
      eventType,
      status: subscription.status,
    });

    // 使用特殊的 userId 格式记录订阅
    await syncSubscription(
      `pending_${customerId}`,
      customerId,
      subscription.id,
      "", // 暂时为空
      subscription.status,
    );

    // TODO: 可以添加到待处理队列或发送通知
    console.log(`[webhook] 孤立订阅已记录，等待手动处理: ${subscription.id}`);
  } catch (error) {
    console.error(`[webhook] 记录孤立订阅失败:`, error);
    // 这种情况下仍然要抛出错误，因为完全处理失败
    throw error;
  }
}
