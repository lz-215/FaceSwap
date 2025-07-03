import type { NextRequest } from "next/server";
import type Stripe from "stripe";

import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { 
  handleCreditRechargeWithTransaction,
  addBonusCreditsWithTransaction 
} from "~/api/credits/credit-service";
import { stripe } from "~/lib/stripe";
import { createClient } from "~/lib/supabase/server";

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

/**
 * 改进版 Stripe Webhook 处理器
 * - 增强错误处理和重试机制
 * - 使用 RPC 函数绕过 RLS 限制
 * - 添加详细的日志记录
 * - 支持幂等性处理
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let eventId = 'unknown';
  
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

    eventId = event.id;
    console.log(`[webhook] 收到事件: ${event.type}, ID: ${event.id}, 时间戳: ${new Date().toISOString()}`);

    // 处理事件（使用幂等性处理）
    const result = await processWebhookEvent(event);
    
    const processingTime = Date.now() - startTime;
    console.log(`[webhook] 事件处理完成: ${event.type}, 耗时: ${processingTime}ms, 结果:`, result);
    
    return NextResponse.json({ 
      success: true, 
      eventId: event.id,
      processingTime,
      result 
    });
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error(`[webhook] Webhook 处理错误 (事件ID: ${eventId}, 耗时: ${processingTime}ms):`, error);
    
    // 记录错误到数据库（可选）
    try {
      await logWebhookError(eventId, error);
    } catch (logError) {
      console.error("[webhook] 记录错误日志失败:", logError);
    }
    
    return NextResponse.json(
      { 
        error: "Webhook 处理错误", 
        success: false,
        eventId,
        processingTime,
        message: error instanceof Error ? error.message : "未知错误"
      },
      { status: 500 },
    );
  }
}

async function processWebhookEvent(event: Stripe.Event) {
  console.log(`[webhook] 开始处理事件: ${event.type}`);

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.deleted":
      case "customer.subscription.updated":
        return await handleSubscriptionChange(event);
      
      case "payment_intent.succeeded":
        return await handlePaymentIntentSucceeded(event);
      
      default:
        console.log(`[webhook] 未处理的事件类型: ${event.type}`);
        return { handled: false, reason: "unsupported_event_type" };
    }
  } catch (error) {
    console.error(`[webhook] 事件处理失败: ${event.type}`, error);
    throw error;
  }
}

/**
 * 支付成功处理（改进版）
 */
async function handlePaymentIntentSucceeded(event: Stripe.Event) {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  const { metadata } = paymentIntent;

  console.log(`[webhook] 处理支付成功: ${paymentIntent.id}, 金额: ${paymentIntent.amount}, 元数据:`, metadata);

  // 检查是否是积分充值
  if (metadata && metadata.type === "credit_recharge") {
    let { rechargeId, userId, credits } = metadata;
    
    if (!rechargeId) {
      console.error(`[webhook] 积分充值支付缺少 rechargeId: ${paymentIntent.id}`);
      throw new Error("积分充值支付缺少 rechargeId");
    }

    // 如果没有userId，尝试通过其他方式查找
    if (!userId) {
      const supabase = await createClient();
      const customerId = paymentIntent.customer as string;

      if (customerId) {
        // 1. 先通过customer_id查找
        const { data: stripeCustomer } = await supabase
          .from("stripe_customer")
          .select("user_id")
          .eq("customer_id", customerId)
          .single();

        if (stripeCustomer?.user_id) {
          userId = stripeCustomer.user_id;
          console.log(`[webhook] 通过customer_id找到用户: ${userId}`);
        }
        // 2. 如果有客户邮箱，尝试通过邮箱匹配
        else {
          const customer = await stripe.customers.retrieve(customerId);
          if (customer && !customer.deleted && customer.email) {
            console.log(`[webhook] 尝试通过email匹配用户: ${customer.email}`);
            
            const { data: user } = await supabase
              .from("user")
              .select("id")
              .eq("email", customer.email)
              .single();
            
            if (user) {
              userId = user.id;
              console.log(`[webhook] 通过email找到用户: ${userId}`);
              
              // 更新客户的metadata以便后续使用
              try {
                await stripe.customers.update(customerId, {
                  metadata: {
                    ...customer.metadata,
                    userId: userId,
                    linkedBy: "email_match",
                    linkedAt: new Date().toISOString(),
                  },
                });
                console.log(`[webhook] 已更新客户metadata`);
              } catch (error) {
                console.error(`[webhook] 更新客户metadata失败`, error);
              }
            }
          }
        }
      }
    }

    if (!userId) {
      console.error(`[webhook] 无法找到用户ID，记录失败支付: ${paymentIntent.id}`);
      await recordFailedPayment(paymentIntent.id, rechargeId, new Error("无法找到用户ID"));
      throw new Error("无法找到用户ID");
    }

    console.log(`[webhook] 开始处理积分充值: 用户=${userId}, 充值ID=${rechargeId}, 积分=${credits}`);

    try {
      // 优先使用 RPC 函数处理支付成功
      const result = await processPaymentWithRPC(paymentIntent.id, rechargeId);
      
      if (result.success) {
        console.log(`[webhook] RPC 函数处理成功:`, {
          rechargeId,
          paymentIntentId: paymentIntent.id,
          userId,
          credits,
          balance: result.balance,
          duplicate: result.duplicate,
        });

        return {
          handled: true,
          type: "credit_recharge",
          method: "rpc",
          rechargeId,
          success: true,
          duplicate: result.duplicate,
          balance: result.balance,
          transactionId: result.transactionId,
        };
      }
    } catch (rpcError) {
      console.error(`[webhook] RPC 函数处理失败: ${rechargeId}`, rpcError);
    }

    // 备用方法：直接使用服务层函数
    try {
      console.log(`[webhook] 尝试使用备用方法处理支付: ${rechargeId}`);
      
      const result = await handleCreditRechargeWithTransaction(rechargeId, paymentIntent.id);
      
      console.log(`[webhook] 备用方法处理成功:`, {
        rechargeId,
        paymentIntentId: paymentIntent.id,
        userId,
        credits,
        balance: result.balance,
      });

      return {
        handled: true,
        type: "credit_recharge",
        method: "fallback",
        rechargeId,
        success: true,
        duplicate: result.duplicate,
        balance: result.balance,
      };
    } catch (fallbackError) {
      console.error(`[webhook] 备用方法也失败: ${rechargeId}`, fallbackError);
      
      // 记录失败的支付以便后续手动处理
      await recordFailedPayment(paymentIntent.id, rechargeId, fallbackError);
      
      throw new Error(`所有处理方法都失败了: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
    }
  }

  // 处理其他类型的支付（如订阅支付）
  console.log(`[webhook] 非积分充值支付，跳过处理: ${paymentIntent.id}`);
  return { handled: false, reason: "not_credit_recharge" };
}

/**
 * 使用 RPC 函数处理支付
 */
async function processPaymentWithRPC(paymentIntentId: string, rechargeId: string) {
  const supabase = await createClient();
  
  console.log(`[webhook] 调用 RPC 函数处理支付: ${rechargeId}, ${paymentIntentId}`);
  
  const { data, error } = await supabase.rpc('handle_stripe_webhook_payment_success', {
    p_payment_intent_id: paymentIntentId,
    p_recharge_id: rechargeId
  });

  if (error) {
    console.error(`[webhook] RPC 函数调用失败: ${rechargeId}`, error);
    throw new Error(`RPC 函数失败: ${error.message}`);
  }

  console.log(`[webhook] RPC 函数返回结果:`, data);
  
  return {
    success: data?.success || false,
    duplicate: data?.duplicate || false,
    balance: data?.newBalance || 0,
    transactionId: data?.transactionId,
  };
}

/**
 * 记录失败的支付
 */
async function recordFailedPayment(paymentIntentId: string, rechargeId: string, error: any) {
  try {
    const supabase = await createClient();
    
    await supabase
      .from('webhook_failures')
      .insert({
        payment_intent_id: paymentIntentId,
        recharge_id: rechargeId,
        error_message: error instanceof Error ? error.message : String(error),
        created_at: new Date().toISOString(),
      });
    
    console.log(`[webhook] 已记录失败的支付: ${paymentIntentId}`);
  } catch (logError) {
    console.error(`[webhook] 记录失败支付时出错:`, logError);
  }
}

/**
 * 记录webhook错误
 */
async function logWebhookError(eventId: string, error: any) {
  try {
    const supabase = await createClient();
    
    await supabase
      .from('webhook_errors')
      .insert({
        event_id: eventId,
        error_message: error instanceof Error ? error.message : String(error),
        error_stack: error instanceof Error ? error.stack : '',
        created_at: new Date().toISOString(),
      });
  } catch (logError) {
    console.error(`[webhook] 记录webhook错误时失败:`, logError);
  }
}

/**
 * 处理订阅变更
 */
async function handleSubscriptionChange(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription;
  const customerId = subscription.customer as string;

  console.log(`[webhook] 处理订阅变更: ${event.type}, 订阅ID: ${subscription.id}, 客户ID: ${customerId}`);

  try {
    const supabase = await createClient();

    // 获取商品信息
    let productId = "";
    if (subscription.items.data.length > 0) {
      const product = await stripe.products.retrieve(
        subscription.items.data[0].price.product as string,
      );
      productId = product.id;
    }

    // 查找对应的用户
    let customer;
    try {
      customer = await stripe.customers.retrieve(customerId);
      if (customer.deleted) {
        console.warn(`[webhook] 客户 ${customerId} 已被删除，尝试从数据库查找关联`);
        customer = null;
      }
    } catch (error) {
      console.error(`[webhook] 获取客户信息失败: ${customerId}`, error);
      customer = null;
    }

    // 从元数据中获取用户ID
    let userId = customer?.metadata?.userId;
    
    // 如果没有从客户元数据获取到userId，尝试从数据库查找
    if (!userId) {
      console.log(`[webhook] 尝试从数据库查找用户关联`);
      
      // 1. 先通过customer_id查找
      const { data: stripeCustomer } = await supabase
        .from("stripe_customer")
        .select("user_id")
        .eq("customer_id", customerId)
        .single();

      if (stripeCustomer?.user_id) {
        userId = stripeCustomer.user_id;
        console.log(`[webhook] 通过customer_id找到用户: ${userId}`);
      }
      // 2. 如果有客户邮箱，尝试通过邮箱匹配
      else if (customer?.email) {
        console.log(`[webhook] 尝试通过email匹配用户: ${customer.email}`);
        
        const { data: user } = await supabase
          .from("user")
          .select("id")
          .eq("email", customer.email)
          .single();
        
        if (user) {
          userId = user.id;
          console.log(`[webhook] 通过email找到用户: ${userId}`);
          
          // 更新客户的metadata以便后续使用
          if (customer && !customer.deleted && userId) {
            try {
              await stripe.customers.update(customerId, {
                metadata: {
                  ...customer.metadata,
                  userId: userId,
                  linkedBy: "email_match",
                  linkedAt: new Date().toISOString(),
                },
              });
              console.log(`[webhook] 已更新客户metadata`);
            } catch (error) {
              console.error(`[webhook] 更新客户metadata失败`, error);
            }
          }
        }
      }
    }

    if (!userId) {
      console.warn(`[webhook] 无法找到用户ID，记录为待处理订阅: ${subscription.id}`);
      
      // 记录待处理订阅到数据库
      await supabase.rpc("insert_pending_subscription", {
        p_subscription_id: subscription.id,
        p_customer_id: customerId,
        p_product_id: productId,
        p_status: subscription.status
      });
      
      return { handled: false, reason: "user_not_found" };
    }

    // 同步订阅状态到数据库
    await supabase.rpc("sync_subscription", {
      p_subscription_id: subscription.id,
      p_user_id: userId,
      p_customer_id: customerId,
      p_product_id: productId,
      p_status: subscription.status
    });

    // 如果是新创建的订阅，给用户奖励积分
    if (event.type === "customer.subscription.created" && subscription.status === "active") {
      await handleSubscriptionBonusCredits(subscription, userId);
    }

    return {
      handled: true,
      type: "subscription_change",
      subscriptionId: subscription.id,
      eventType: event.type,
    };
  } catch (error) {
    console.error(`[webhook] 订阅处理失败: ${subscription.id}`, error);
    throw error;
  }
}

async function handleSubscriptionBonusCredits(subscription: Stripe.Subscription, userId: string) {
  try {
    // 根据订阅类型给予奖励积分
    const priceAmount = subscription.items.data[0]?.price?.unit_amount;
    const amount = typeof priceAmount === 'number' ? priceAmount : null;
    let creditsToAdd = 120; // 默认月付积分
    let description = "订阅成功赠送积分";

    if (amount === 1690) {
      creditsToAdd = 120;
      description = "月付订阅成功赠送120积分";
    } else if (amount === 990) {
      creditsToAdd = 1800;
      description = "年付订阅成功赠送1800积分";
    }

    console.log(`[webhook] 为订阅用户 ${userId} 奖励 ${creditsToAdd} 积分`);

    try {
      await addBonusCreditsWithTransaction(userId, creditsToAdd, description, {
        subscriptionId: subscription.id,
        bonusType: "subscription_welcome",
        amount: amount,
      });
      
      console.log(`[webhook] 订阅奖励积分处理成功: ${userId}`);
    } catch (error) {
      console.error(`[webhook] 订阅奖励积分处理失败: ${userId}`, error);
      // 记录失败的积分奖励到待处理表
      const supabase = await createClient();
      await supabase.rpc("insert_pending_bonus_credits", {
        p_user_id: userId,
        p_amount: creditsToAdd,
        p_description: description,
        p_metadata: {
          subscriptionId: subscription.id,
          bonusType: "subscription_welcome",
          amount: amount,
          failedAt: new Date().toISOString(),
          error: error instanceof Error ? error.message : "Unknown error"
        }
      });
    }
  } catch (error) {
    console.error(`[webhook] 订阅奖励积分处理时出错: ${userId}`, error);
  }
}
