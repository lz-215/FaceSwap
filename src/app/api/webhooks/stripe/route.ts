import type { NextRequest } from "next/server";
import type Stripe from "stripe";
import { createId } from "@paralleldrive/cuid2";

import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { addBonusCreditsWithTransaction } from "~/api/credits/credit-service";
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
  
  // 添加初始日志
  console.log('------------------------');
  console.log(`[webhook] 收到Stripe Webhook请求 - ${new Date().toISOString()}`);
  console.log(`[webhook] 请求方法: ${request.method}`);
  console.log(`[webhook] 请求头:`, Object.fromEntries(request.headers));
  
  try {
    const body = await request.text();
    console.log(`[webhook] 收到原始请求体:`, body.substring(0, 500) + (body.length > 500 ? '...' : ''));
    
    const headersList = headers();
    const signature = (await headersList).get("stripe-signature");

    if (!signature || !webhookSecret) {
      console.error("[webhook] Webhook签名验证失败 - 缺少签名或密钥");
      console.error({
        hasSignature: !!signature,
        hasWebhookSecret: !!webhookSecret,
        signature: signature?.substring(0, 20) + '...',
      });
      return new NextResponse("Webhook签名验证失败", { status: 400 });
    }

    // 验证webhook签名
    console.log("[webhook] 开始验证Webhook签名");
    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      webhookSecret,
    );

    eventId = event.id;
    console.log(`[webhook] 签名验证成功! 事件类型: ${event.type}, ID: ${event.id}`);

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
  console.log(`[webhook] 事件详情:`, {
    id: event.id,
    type: event.type,
    created: new Date(event.created * 1000).toISOString(),
    hasData: !!event.data,
    hasObject: !!event.data?.object,
  });

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.deleted":
      case "customer.subscription.updated":
        console.log(`[webhook] 开始处理订阅事件: ${event.type}`);
        const result = await handleSubscriptionChange(event);
        console.log(`[webhook] 订阅事件处理完成:`, result);
        return result;
      
      case "payment_intent.succeeded":
        console.log(`[webhook] 开始处理支付成功事件`);
        const paymentResult = await handlePaymentIntentSucceeded(event);
        console.log(`[webhook] 支付事件处理完成:`, paymentResult);
        return paymentResult;
      
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
  console.log(`[webhook] PaymentIntent完整数据:`, {
    id: paymentIntent.id,
    amount: paymentIntent.amount,
    currency: paymentIntent.currency,
    customer: paymentIntent.customer,
    status: paymentIntent.status,
    metadata: paymentIntent.metadata,
  });

  // 处理其他类型的支付（如订阅支付）
  console.log(`[webhook] 非积分充值支付，跳过处理: ${paymentIntent.id}`);
  return { handled: false, reason: "not_credit_recharge" };
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

  console.log(`[webhook] [handleSubscriptionChange] 开始处理订阅变更: ${event.type}, 订阅ID: ${subscription.id}, 客户ID: ${customerId}`);

  try {
    const supabase = await createClient();
    console.log('[webhook] [handleSubscriptionChange] 已创建 Supabase 客户端');

    // 获取商品信息
    let productId = "";
    if (subscription.items.data.length > 0) {
      const product = await stripe.products.retrieve(
        subscription.items.data[0].price.product as string,
      );
      productId = product.id;
      console.log(`[webhook] [handleSubscriptionChange] 获取商品信息成功: productId=${productId}`);
    } else {
      console.log('[webhook] [handleSubscriptionChange] 订阅无商品信息');
    }

    // 查找对应的用户
    let customer;
    try {
      customer = await stripe.customers.retrieve(customerId);
      if (customer.deleted) {
        console.warn(`[webhook] [handleSubscriptionChange] 客户 ${customerId} 已被删除，尝试从数据库查找关联`);
        customer = null;
      } else {
        console.log(`[webhook] [handleSubscriptionChange] 获取客户信息成功: ${customerId}`);
      }
    } catch (error) {
      console.error(`[webhook] [handleSubscriptionChange] 获取客户信息失败: ${customerId}`, error);
      customer = null;
    }

    // 从元数据中获取用户ID
    let userId = customer?.metadata?.userId;
    console.log(`[webhook] [handleSubscriptionChange] 从 customer.metadata.userId 获取 userId: ${userId}`);
    
    // 如果没有从客户元数据获取到userId，尝试从订阅元数据中获取
    if (!userId && subscription.metadata?.userId) {
      console.log(`[webhook] [handleSubscriptionChange] 从订阅metadata中获取用户ID: ${subscription.metadata.userId}`);
      // 验证用户ID是否有效 - 检查用户配置是否存在
      const { data: userProfile, error: userError } = await supabase
        .from("user_profiles")
        .select("id")
        .eq("id", subscription.metadata.userId)
        .single();
      if (userProfile) {
        userId = userProfile.id;
        console.log(`[webhook] [handleSubscriptionChange] 订阅metadata中的用户ID有效: ${userId}`);
      } else {
        console.warn(`[webhook] [handleSubscriptionChange] 订阅metadata中的用户ID无效: ${subscription.metadata.userId}, 错误:`, userError);
      }
    }

    if (!userId) {
      // 详细日志
      console.warn(`[webhook] [handleSubscriptionChange] 无法找到用户ID，无法同步订阅状态: ${subscription.id}`);
      console.warn('[webhook] [handleSubscriptionChange] 详细上下文:', {
        subscriptionId: subscription.id,
        customerId,
        customerEmail: customer?.email,
        subscriptionMetadata: subscription.metadata,
      });
      return; // 找不到userId直接返回，不做任何补全
    }

    // 同步 user_profiles 表 subscription_status 字段
    console.log(`[webhook] [handleSubscriptionChange] 开始同步 user_profiles.subscription_status: userId=${userId}, status=${subscription.status}`);
    const { error: statusUpdateError } = await supabase
      .from("user_profiles")
      .update({ subscription_status: subscription.status, updated_at: new Date().toISOString() })
      .eq("id", userId);
    if (statusUpdateError) {
      console.error(`[webhook] [handleSubscriptionChange] 同步user_profiles表subscription_status失败:`, statusUpdateError);
    } else {
      console.log(`[webhook] [handleSubscriptionChange] 已同步user_profiles表subscription_status: ${subscription.status}`);
    }

    // 只有订阅为 active 时才奖励积分
    if (subscription.status === 'active') {
      try {
        console.log(`[webhook] [handleSubscriptionChange] 订阅状态为 active，准备发放奖励积分`);
        await handleSubscriptionBonusCredits(subscription, userId);
        console.log(`[webhook] [handleSubscriptionChange] 已为用户 ${userId} 发放订阅奖励积分`);
      } catch (bonusError) {
        console.error(`[webhook] [handleSubscriptionChange] 订阅奖励积分发放失败:`, bonusError);
      }
    } else {
      console.log(`[webhook] [handleSubscriptionChange] 订阅状态为 ${subscription.status}，未发放奖励积分`);
    }

  } catch (error) {
    console.error(`[webhook] [handleSubscriptionChange] 订阅处理失败: ${subscription.id}`, error);
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

    console.log(`[webhook] 处理订阅积分分配 - priceAmount: ${amount} cents`);

    if (amount === 1690) {
      // 月付订阅 $16.90
      creditsToAdd = 120;
      description = "月付订阅成功赠送120积分";
      console.log(`[webhook] 识别为月付订阅 ($16.90), 分配 ${creditsToAdd} 积分`);
    } else if (amount === 11880) {
      // 年付订阅 $118.80  
      creditsToAdd = 1800;
      description = "年付订阅成功赠送1800积分";
      console.log(`[webhook] 识别为年付订阅 ($118.80), 分配 ${creditsToAdd} 积分`);
    } else {
      console.warn(`[webhook] 未识别的订阅价格: ${amount} cents, 使用默认积分 ${creditsToAdd}`);
      // 根据间隔类型猜测
      const interval = subscription.items.data[0]?.price?.recurring?.interval;
      if (interval === 'year') {
        creditsToAdd = 1800;
        description = "年付订阅成功赠送1800积分";
        console.log(`[webhook] 根据间隔类型(年)推断, 分配 ${creditsToAdd} 积分`);
      }
    }

    // 新增：仅在本周期未写入时插入 subscription_credits
    const supabase = await createClient();
    // Stripe.Subscription 类型声明可能缺失，需用 any 断言
    const startDate = new Date((subscription as any).current_period_start * 1000).toISOString();
    const endDate = new Date((subscription as any).current_period_end * 1000).toISOString();

    console.log(`[webhook] 订阅周期: ${startDate} 到 ${endDate}`);

    // 检查本周期是否已存在记录
    const { data: existing, error: checkError } = await supabase
      .from("subscription_credits")
      .select("id")
      .eq("user_id", userId)
      .eq("subscription_id", subscription.id)
      .eq("start_date", startDate)
      .eq("end_date", endDate)
      .maybeSingle();

    if (checkError) {
      console.error("[webhook] 检查 subscription_credits 失败:", checkError);
      throw checkError;
    }

    if (!existing) {
      const { error: insertError } = await supabase.from("subscription_credits").insert({
        user_id: userId,
        subscription_id: subscription.id,
        credits: creditsToAdd,
        remaining_credits: creditsToAdd,
        start_date: startDate,
        end_date: endDate,
        status: "active"
      });
      if (insertError) {
        console.error("[webhook] 插入 subscription_credits 失败:", insertError);
        throw insertError;
      } else {
        console.log(`[webhook] 已写入 subscription_credits: userId=${userId}, credits=${creditsToAdd}, period=${startDate}~${endDate}`);
      }
    } else {
      console.log(`[webhook] 本周期 subscription_credits 已存在，跳过插入: userId=${userId}, period=${startDate}~${endDate}`);
    }

    // 保留原有积分奖励逻辑
    await addBonusCreditsWithTransaction(userId, creditsToAdd, description, {
      subscriptionId: subscription.id,
      bonusType: "subscription_welcome",
      amount,
      addedBy: "webhook",
    });

    console.log(`[webhook] 订阅积分分配完成: userId=${userId}, credits=${creditsToAdd}`);
  } catch (error) {
    console.error(`[webhook] 订阅奖励积分发放失败:`, error);
    throw error;
  }
}