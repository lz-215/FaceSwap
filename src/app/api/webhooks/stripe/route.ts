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
    console.error("[webhook] Webhook 处理错误:", error);
    
    return NextResponse.json(
      { 
        error: "Webhook 处理错误", 
        success: false,
        message: error instanceof Error ? error.message : "未知错误"
      },
      { status: 500 },
    );
  }
}

async function processWebhookEvent(event: Stripe.Event) {
  // 记录事件处理开始
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
    const customer = await stripe.customers.retrieve(customerId);
    if (!customer || customer.deleted) {
      console.error(`[webhook] 找不到客户 ${customerId}`);
      throw new Error("找不到客户");
    }

    // 从元数据中获取用户ID
    let userId = customer.metadata?.userId;
    
    // 如果没有userId metadata，尝试通过email匹配用户
    if (!userId && customer.email) {
      console.log(`[webhook] 客户没有userId metadata，尝试通过email匹配: ${customer.email}`);
      
      const { data: user, error } = await supabase
        .from("user")
        .select("*")
        .eq("email", customer.email)
        .single();
      
      if (!error && user) {
        userId = user.id;
        console.log(`[webhook] 通过email找到用户: ${userId}`);
        
        // 更新客户的metadata以便后续使用
        await stripe.customers.update(customerId, {
          metadata: {
            ...customer.metadata,
            userId: userId,
            linkedBy: "email_match",
            linkedAt: new Date().toISOString(),
          },
        });
      }
    }

    if (!userId) {
      console.warn(`[webhook] 无法找到用户ID，记录为待处理订阅: ${subscription.id}`);
      
      // 记录待处理订阅到数据库
      await supabase
        .from("stripe_subscription")
        .upsert({
          id: `pending_${subscription.id}`,
          user_id: `pending_${customerId}`,
          customer_id: customerId,
          subscription_id: subscription.id,
          product_id: productId,
          status: subscription.status,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      
      return { handled: false, reason: "user_not_found" };
    }

    // 同步订阅状态到数据库
    await supabase
      .from("stripe_subscription")
      .upsert({
        id: subscription.id,
        user_id: userId,
        customer_id: customerId,
        subscription_id: subscription.id,
        product_id: productId,
        status: subscription.status,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    // 如果是新创建的订阅，给用户奖励积分
    if (event.type === "customer.subscription.created") {
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
    const bonusCredits = 100; // 示例：订阅奖励100积分
    const reason = "订阅成功赠送积分";

    console.log(`[webhook] 为订阅用户 ${userId} 奖励 ${bonusCredits} 积分`);

    try {
      await addBonusCreditsWithTransaction(userId, bonusCredits, reason, {
        reason: "subscription_bonus",
        subscriptionId: subscription.id,
      });

      console.log(`[webhook] 订阅积分奖励成功`, {
        userId,
        subscriptionId: subscription.id,
        bonusCredits,
      });
    } catch (error) {
      console.error(`[webhook] 订阅积分奖励失败`, {
        userId,
        subscriptionId: subscription.id,
        error: error instanceof Error ? error.message : error,
      });
      
      // 不抛出错误，避免影响订阅创建
      console.warn(`[webhook] 积分奖励失败但不影响订阅，请手动处理用户 ${userId} 的积分`);
    }
  } catch (error) {
    console.error(`[webhook] 处理订阅奖励积分时出错`, error);
    // 不抛出错误，避免影响订阅处理
  }
}

/**
 * 支付成功处理（改进版 - 使用 RPC 函数）
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
      // 使用 Supabase RPC 函数处理支付成功，绕过 RLS 限制
      const supabase = await createClient();
      
      console.log(`[webhook] 调用 RPC 函数处理支付: ${rechargeId}, ${paymentIntent.id}`);
      
      const { data: result, error } = await supabase.rpc('handle_stripe_webhook_payment_success', {
        p_payment_intent_id: paymentIntent.id,
        p_recharge_id: rechargeId
      });

      if (error) {
        console.error(`[webhook] RPC 函数调用失败:`, error);
        throw new Error(`RPC 函数调用失败: ${error.message}`);
      }

      if (!result || !result.success) {
        console.error(`[webhook] RPC 函数返回失败结果:`, result);
        throw new Error(`RPC 函数处理失败: ${result?.message || '未知错误'}`);
      }
      
      console.log(`[webhook] 积分充值处理成功:`, {
        rechargeId,
        paymentIntentId: paymentIntent.id,
        userId: metadata.userId,
        credits: metadata.credits,
        balance: result.balance,
        duplicate: result.duplicate,
        rpcResult: result
      });

      return {
        handled: true,
        type: "credit_recharge",
        rechargeId,
        success: true,
        duplicate: result.duplicate,
        balance: result.balance,
        transactionId: result.transactionId,
      };
    } catch (error) {
      console.error(`[webhook] 积分充值处理失败: ${rechargeId}`, error);
      
      // 如果 RPC 函数失败，尝试使用备用方法
      console.log(`[webhook] 尝试使用备用方法处理支付: ${rechargeId}`);
      
      try {
        const result = await handleCreditRechargeWithTransaction(rechargeId, paymentIntent.id);
        
        console.log(`[webhook] 备用方法处理成功:`, {
          rechargeId,
          paymentIntentId: paymentIntent.id,
          userId: metadata.userId,
          credits: metadata.credits,
          balance: result.balance,
        });

        return {
          handled: true,
          type: "credit_recharge",
          rechargeId,
          success: true,
          duplicate: result.duplicate,
          balance: result.balance,
          method: "fallback"
        };
      } catch (fallbackError) {
        console.error(`[webhook] 备用方法也失败: ${rechargeId}`, fallbackError);
        throw fallbackError;
      }
    }
  }

  // 处理其他类型的支付（如订阅支付）
  console.log(`[webhook] 非积分充值支付，跳过处理: ${paymentIntent.id}`);
  return { handled: false, reason: "not_credit_recharge" };
}
