import type { NextRequest } from "next/server";
import type Stripe from "stripe";
import { createId } from "@paralleldrive/cuid2";

import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { addBonusCreditsWithTransaction } from "~/api/credits/credit-service";
import { stripe } from "~/lib/stripe";
import { createServiceClient } from "~/lib/supabase/server";

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
      case "customer.subscription.updated":
      case "invoice.paid":
      case "invoice.payment_succeeded": {
        // 只在这四个事件中执行周期权益逻辑
        console.log(`[webhook] 处理周期权益事件: ${event.type}`);
        console.log(`[webhook] 事件对象详情:`, JSON.stringify(event.data.object, null, 2));
        const result = await handleSubscriptionChange(event);
        console.log(`[webhook] 订阅事件处理完成:`, result);
        return result;
      }
      case "customer.subscription.deleted": {
        // 只做状态同步，不做周期权益写入
        console.log(`[webhook] 处理订阅删除事件: ${event.type}`);
        const subscriptionFromWebhook = event.data.object as Stripe.Subscription;
        const customerId = subscriptionFromWebhook.customer as string;
        console.log(`[webhook] 删除事件详情:`, {
          subscriptionId: subscriptionFromWebhook.id,
          customerId,
          status: subscriptionFromWebhook.status
        });
        const supabase = createServiceClient();
        const customer = await stripe.customers.retrieve(customerId);
        if (customer.deleted) {
          console.warn(`[webhook] [handleSubscriptionChange] 客户 ${customerId} 已被删除，忽略.`);
          return;
        }
        const userId = customer.metadata.userId;
        if (!userId) {
          console.warn(`[webhook] [handleSubscriptionChange] 无法从 customer.metadata 找到 userId，无法同步订阅状态: ${subscriptionFromWebhook.id}`);
          return;
        }
        console.log(`[webhook] 找到用户ID: ${userId}，准备同步订阅状态`);
        // 只同步 user_profiles 状态
        await syncSubscriptionAndAddCredits(subscriptionFromWebhook, userId, event.type);
        console.log(`[webhook] [handleSubscriptionChange] 已同步订阅状态: ${subscriptionFromWebhook.status}`);
        return { handled: true, type: "subscription_deleted", status: subscriptionFromWebhook.status };
      }
      case "payment_intent.succeeded": {
        // 保持原有支付成功处理逻辑
        console.log(`[webhook] 开始处理支付成功事件`);
        const paymentResult = await handlePaymentIntentSucceeded(event);
        console.log(`[webhook] 支付事件处理完成:`, paymentResult);
        return paymentResult;
      }
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

  // 检查是否是积分充值
  if (metadata && metadata.type === "credit_recharge") {
    const { rechargeId, userId, credits } = metadata;
    
    if (!rechargeId) {
      console.error(`[webhook] 积分充值支付缺少 rechargeId: ${paymentIntent.id}`);
      throw new Error("积分充值支付缺少 rechargeId");
    }

    console.log(`[webhook] 开始处理积分充值: 用户=${userId}, 充值ID=${rechargeId}, 积分=${credits}`);

    try {
      // 使用 Supabase RPC 函数处理支付成功
      const result = await processPaymentWithRPC(paymentIntent.id, rechargeId);
      
      if (result.success) {
        console.log(`[webhook] 积分充值处理成功:`, {
          rechargeId,
          paymentIntentId: paymentIntent.id,
          userId,
          credits,
          balance: result.balanceAfter,
          duplicate: result.duplicate,
        });

        return {
          handled: true,
          type: "credit_recharge",
          method: "rpc",
          rechargeId,
          success: true,
          duplicate: result.duplicate,
          balance: result.balanceAfter,
        };
      }
    } catch (rpcError) {
      console.error(`[webhook] RPC 函数处理失败: ${rechargeId}`, rpcError);
      
      // 如果RPC失败，尝试备用方法
      try {
        console.log(`[webhook] 尝试使用备用方法处理支付: ${rechargeId}`);
        const backupResult = await handleCreditRechargeWithBackup(rechargeId, paymentIntent.id, userId, credits);
        
        console.log(`[webhook] 备用方法处理成功:`, {
          rechargeId,
          paymentIntentId: paymentIntent.id,
          userId,
          credits,
          balance: backupResult.balance,
        });

        return {
          handled: true,
          type: "credit_recharge",
          method: "backup",
          rechargeId,
          success: true,
          balance: backupResult.balance,
        };
      } catch (backupError) {
        console.error(`[webhook] 备用方法也失败: ${rechargeId}`, backupError);
        
        // 记录失败的支付以便后续手动处理
        await recordFailedPayment(paymentIntent.id, rechargeId, backupError);
        throw new Error(`所有处理方法都失败了: ${backupError instanceof Error ? backupError.message : String(backupError)}`);
      }
    }
  }

  // 处理其他类型的支付（如订阅支付）
  console.log(`[webhook] 非积分充值支付，检查是否关联订阅: ${paymentIntent.id}`);
  if ((paymentIntent as any).subscription) {
    console.log(`[webhook] 支付关联到订阅: ${(paymentIntent as any).subscription}, 准备同步订阅状态和发放积分`);
    try {
      const subscription = await stripe.subscriptions.retrieve((paymentIntent as any).subscription as string);
      const customer = await stripe.customers.retrieve(subscription.customer as string);
      const userId = (customer as Stripe.Customer).metadata.userId;

      if (!userId) {
        throw new Error(`无法从 customer.metadata 中找到 userId, customerId: ${customer.id}`);
      }

      await syncSubscriptionAndAddCredits(subscription, userId, 'payment_succeeded');
      return { handled: true, type: "subscription_payment" };

    } catch (error) {
       console.error(`[webhook] 处理订阅支付失败:`, error);
       throw error;
    }
  }
  
  console.log(`[webhook] 非积分充值且非订阅支付，跳过处理: ${paymentIntent.id}`);
  return { handled: false, reason: "not_credit_recharge_or_subscription" };
}

/**
 * 使用 RPC 函数处理支付
 */
async function processPaymentWithRPC(paymentIntentId: string, rechargeId: string) {
  const supabase = createServiceClient();
  
  console.log(`[webhook] 调用 RPC 函数处理支付: ${rechargeId}, ${paymentIntentId}`);
  
  // 首先尝试调用专门的支付处理函数
  const { data: result, error } = await supabase.rpc('handle_payment_success', {
    p_payment_intent_id: paymentIntentId,
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

  return result;
}

/**
 * 备用方法：直接处理积分充值
 */
async function handleCreditRechargeWithBackup(
  rechargeId: string, 
  paymentIntentId: string, 
  userId: string, 
  credits: string
) {
  const supabase = createServiceClient();
  const creditsAmount = parseInt(credits || '0');
  
  console.log(`[webhook] 使用备用方法处理积分充值: userId=${userId}, credits=${creditsAmount}`);

  // 直接调用充值函数
  const { data: rechargeResult, error: rechargeError } = await supabase.rpc('recharge_credits_v2', {
    p_user_id: userId,
    amount_to_add: creditsAmount,
    payment_intent_id: paymentIntentId,
    transaction_description: `支付成功充值${creditsAmount}积分 (${paymentIntentId})`
  });

  if (rechargeError) {
    throw new Error(`充值积分失败: ${rechargeError.message}`);
  }

  if (!rechargeResult.success) {
    throw new Error(`充值积分失败: ${rechargeResult.message || '未知错误'}`);
  }

  console.log(`[webhook] 备用方法充值成功: 新余额=${rechargeResult.balanceAfter}`);
  
  return {
    balance: rechargeResult.balanceAfter,
    success: true,
    message: rechargeResult.message
  };
}

/**
 * 记录失败的支付
 */
async function recordFailedPayment(paymentIntentId: string, rechargeId: string, error: any) {
  try {
    const supabase = createServiceClient();
    
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
    const supabase = createServiceClient();
    
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
  const subscriptionFromWebhook = event.data.object as Stripe.Subscription;
  const customerId = subscriptionFromWebhook.customer as string;

  console.log(`[webhook] [handleSubscriptionChange] 开始处理订阅状态变更: ${event.type}, 订阅ID: ${subscriptionFromWebhook.id}`);
  console.log(`[webhook] [handleSubscriptionChange] 订阅详情:`, {
    subscriptionId: subscriptionFromWebhook.id,
    customerId,
    status: subscriptionFromWebhook.status,
    hasItems: !!subscriptionFromWebhook.items,
    itemsCount: subscriptionFromWebhook.items?.data?.length || 0
  });

  try {
    const supabase = createServiceClient();
    console.log(`[webhook] [handleSubscriptionChange] 准备获取 Stripe 客户信息: ${customerId}`);
    const customer = await stripe.customers.retrieve(customerId);
    console.log(`[webhook] [handleSubscriptionChange] 获取到客户信息:`, {
      customerId: customer.id,
      deleted: customer.deleted,
      hasMetadata: 'metadata' in customer && !!(customer as any).metadata,
      metadata: 'metadata' in customer ? (customer as any).metadata : undefined
    });
    
    if (customer.deleted) {
      console.warn(`[webhook] [handleSubscriptionChange] 客户 ${customerId} 已被删除，忽略.`);
      return;
    }
    
    const userId = 'metadata' in customer ? (customer as any).metadata?.userId : undefined;
    console.log(`[webhook] [handleSubscriptionChange] 提取用户ID: ${userId}`);

    if (!userId) {
      console.warn(`[webhook] [handleSubscriptionChange] 无法从 customer.metadata 找到 userId，无法同步订阅状态: ${subscriptionFromWebhook.id}`);
      return;
    }
    
    // 此函数现在只负责同步订阅状态（如 active, canceled），不再发放积分
    // 积分发放由 payment_intent.succeeded 事件处理
    console.log(`[webhook] [handleSubscriptionChange] 准备调用 syncSubscriptionAndAddCredits`);
    await syncSubscriptionAndAddCredits(subscriptionFromWebhook, userId, event.type);

    console.log(`[webhook] [handleSubscriptionChange] 已同步订阅状态: ${subscriptionFromWebhook.status}`);

  } catch (error) {
    console.error(`[webhook] [handleSubscriptionChange] 订阅状态同步失败: ${subscriptionFromWebhook.id}`, error);
    throw error;
  }
}

/**
 * 新的核心函数：同步订阅所有相关数据并根据情况发放积分
 */
async function syncSubscriptionAndAddCredits(subscription: Stripe.Subscription, userId: string, eventType: string) {
  // 详细的环境变量和连接检查
  console.log('[sync] ===== syncSubscriptionAndAddCredits 开始 =====');
  console.log('[sync] 环境变量检查:', {
    hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    eventType,
    subscriptionId: subscription.id,
    userId,
    subscriptionStatus: subscription.status
  });

  const supabase = createServiceClient();
  console.log('[sync] Supabase 客户端已创建');

  // 新增：先将该用户其它 active 订阅全部置为 cancelled（除当前 subscription_id）
  if (subscription.status === 'active') {
    console.log('[sync] 开始清理用户其他 active 订阅...');
    const { data: cancelResult, error: cancelError } = await supabase
      .from('subscription_credits')
      .update({
        status: 'cancelled',
      })
      .eq('user_id', userId)
      .eq('status', 'active')
      .neq('subscription_id', subscription.id);
      
    if (cancelError) {
      console.error('[sync] 清理其他订阅失败:', cancelError);
    } else {
      console.log('[sync] 成功清理其他订阅:', cancelResult);
    }
  }

  // 日志等保留
  const created = subscription.created;
  const period_start = (subscription as any).current_period_start;
  const period_end = (subscription as any).current_period_end;
  const items = subscription.items && Array.isArray(subscription.items.data) ? subscription.items.data : [];
  const priceAmount = items[0]?.price?.unit_amount;
  const creditsToAdd = priceAmount === 1690 ? 120 : priceAmount === 11880 ? 1800 : 120;
  const startDate = period_start ? new Date(period_start * 1000).toISOString() : null;
  const endDate = period_end ? new Date(period_end * 1000).toISOString() : null;

  console.log('[sync] 订阅数据解析:', {
    created,
    period_start,
    period_end,
    priceAmount,
    creditsToAdd,
    startDate,
    endDate,
    itemsCount: items.length
  });

      const subscriptionData = {
        user_id: userId,
        subscription_id: subscription.id,
        status: subscription.status,
    total_credits: creditsToAdd,
    remaining_credits: creditsToAdd, // 可根据实际消费逻辑调整
    start_date: startDate,
    end_date: endDate,
    current_period_start: startDate,
    current_period_end: endDate,
    product_id: items[0]?.price?.product,
    price_id: items[0]?.price?.id,
    stripe_customer_id: subscription.customer as string,
    stripe_status: subscription.status,
        created_at: created ? new Date(created * 1000).toISOString() : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

  console.log('[sync] 准备写入的数据:', JSON.stringify(subscriptionData, null, 2));
  console.log('[sync] 开始执行 upsert 操作...');

  const { error } = await supabase.from('subscription_credits').upsert(
    {
      user_id: subscriptionData.user_id,
      subscription_id: subscriptionData.subscription_id,
      credits: subscriptionData.total_credits,
      remaining_credits: subscriptionData.remaining_credits,
      start_date: subscriptionData.start_date || new Date().toISOString(),
      end_date: subscriptionData.end_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      status: subscriptionData.status,
    },
    { onConflict: 'subscription_id' }
  );
  if (error) {
    console.error('[webhook] 写入 subscription_credits 失败:', error, subscriptionData);
    console.error('[sync] 错误详情:', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint
    });
  } else {
    console.log('[sync] ✅ 数据写入成功!');
    
    // 验证写入结果
    const { data: verifyData, error: verifyError } = await supabase
      .from('subscription_status_monitor')
      .select('*')
      .eq('subscription_id', subscription.id)
      .limit(1);
      
    if (verifyError) {
      console.error('[sync] 验证写入结果失败:', verifyError);
    } else {
      console.log('[sync] 验证写入结果:', verifyData);
    }
  }
  
  console.log('[sync] ===== syncSubscriptionAndAddCredits 结束 =====');
}

/**
 * 处理订阅状态变更和积分管理
 */
async function handleSubscriptionStatusChange(
  subscription: Stripe.Subscription, 
  userId: string, 
  eventType: string,
  hasValidTimestamps: boolean
) {
  console.log(`[status] 处理订阅状态变更: ${eventType}, 状态: ${subscription.status}, 时间戳完整: ${hasValidTimestamps}`);

  // 根据订阅状态和事件类型采取不同行动
  switch (subscription.status) {
    case 'active':
      await handleActiveSubscription(subscription, userId, eventType, hasValidTimestamps);
      break;
    
    case 'canceled':
    case 'unpaid':
    case 'past_due':
      await handleInactiveSubscription(subscription, userId, eventType);
      break;
    
    case 'trialing':
      console.log(`[status] 订阅处于试用期: ${subscription.id}`);
      // 试用期不发放积分，但可以记录状态
      break;
    
    case 'incomplete':
    case 'incomplete_expired':
      console.log(`[status] 订阅状态为 ${subscription.status}，等待支付完成`);
      // 不完整的订阅暂不发放积分
      break;
    
    default:
      console.log(`[status] 订阅状态 ${subscription.status} 不需要特殊处理`);
  }
}

/**
 * 处理活跃订阅
 */
async function handleActiveSubscription(
  subscription: Stripe.Subscription,
  userId: string,
  eventType: string,
  hasValidTimestamps: boolean
) {
  console.log(`[active] 处理活跃订阅: ${subscription.id}, 时间戳完整: ${hasValidTimestamps}`);

  // 判断是否应该发放积分
  const shouldAllocateCredits = 
    eventType === 'customer.subscription.created' ||
    eventType === 'customer.subscription.updated' ||
    eventType === 'invoice.payment_succeeded';
    
  if (shouldAllocateCredits) {
    console.log(`[active] 检测到需要发放积分的事件: ${eventType}`);
    try {
      await handleSubscriptionBonusCredits(subscription, userId);
      
      // 如果有有效时间戳，更新或创建订阅积分记录
      if (hasValidTimestamps) {
        await updateSubscriptionCredits(subscription, userId);
      } else {
        console.log(`[active] 时间戳不完整，跳过详细订阅积分记录创建，但积分已发放`);
      }
    } catch (creditError) {
      console.error(`[active] 积分发放失败:`, creditError);
      // 不抛出错误，避免影响其他处理
    }
  } else {
    console.log(`[active] 事件 ${eventType} 不需要发放积分`);
  }
}

/**
 * 处理非活跃订阅
 */
async function handleInactiveSubscription(
  subscription: Stripe.Subscription,
  userId: string,
  eventType: string
) {
  console.log(`[inactive] 处理非活跃订阅: ${subscription.id}, 状态: ${subscription.status}`);

  const supabase = createServiceClient();

  // 将相关的订阅积分标记为过期或取消
  const { error: expireError } = await supabase
    .from('subscription_status_monitor')
    .update({
      status: subscription.status === 'canceled' ? 'cancelled' : 'expired',
      updated_at: new Date().toISOString()
    })
    .eq('subscription_id', subscription.id)
    .eq('status', 'active');

  if (expireError) {
    console.error(`[inactive] 更新订阅积分状态失败:`, expireError);
  } else {
    console.log(`[inactive] 已将订阅积分标记为 ${subscription.status === 'canceled' ? 'cancelled' : 'expired'}`);
  }

  // 调用数据库函数重新计算用户积分余额
  const { error: recalcError } = await supabase.rpc('recalculate_user_balance', {
    p_user_id: userId,
  });

  if (recalcError) {
    console.error(`[inactive] 调用 recalculate_user_balance RPC 失败:`, recalcError);
  } else {
    console.log(`[inactive] 成功触发用户 ${userId} 的余额重新计算。`);
  }
}

/**
 * 更新或创建订阅积分记录
 */
async function updateSubscriptionCredits(subscription: Stripe.Subscription, userId: string) {
  const supabase = createServiceClient();
  console.log("[credits] 收到订阅对象:", JSON.stringify(subscription, null, 2));

  // 安全获取 items.data
  const items = subscription.items && Array.isArray(subscription.items.data) ? subscription.items.data : [];
  if (!items[0] || !items[0].price) {
    console.error('[credits] subscription.items.data 缺失或无 price，无法获取价格信息', subscription);
    return;
  }
  const priceAmount = items[0].price.unit_amount;
  const creditsToAdd = priceAmount === 1690 ? 120 : priceAmount === 11880 ? 1800 : 120;

  // 用固定周期计算 start_date 和 end_date
  const { startDate, endDate } = calculateFixedPeriodDates(subscription);

  // 检查是否已存在该订阅期间的积分记录
  const { data: existingCredits } = await supabase
    .from('subscription_status_monitor')
    .select('*')
    .eq('subscription_id', subscription.id)
    .eq('start_date', startDate)
    .single();

  if (existingCredits) {
    console.log(`[credits] 订阅积分记录已存在，跳过创建: ${existingCredits.id}`);
    return;
  }

  // 写入 subscription_credits
  console.log("[credits] 即将写入 subscription_credits：", {
    user_id: userId,
    subscription_id: subscription.id,
    credits: creditsToAdd,
    remaining_credits: creditsToAdd,
    start_date: startDate,
    end_date: endDate,
    status: 'active',
  });

  const { error: subscriptionCreditsError } = await supabase.from('subscription_credits').insert({
    user_id: userId,
    subscription_id: subscription.id,
    credits: creditsToAdd,
    remaining_credits: creditsToAdd,
    start_date: startDate || new Date().toISOString(),
    end_date: endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'active',
  });

  if (subscriptionCreditsError) {
    console.error(`[credits] 记录订阅积分失败:`, subscriptionCreditsError);
  } else {
    console.log(`[credits] 订阅积分记录创建成功: ${creditsToAdd} 积分，到期时间: ${endDate}`);
  }
}



/**
 * 处理订阅积分发放
 */
async function handleSubscriptionBonusCredits(subscription: Stripe.Subscription, userId: string) {
  const items = subscription.items && Array.isArray(subscription.items.data) ? subscription.items.data : [];
  if (!items[0] || !items[0].price) {
    console.error('[webhook] subscription.items.data 缺失或无 price，无法获取价格信息', subscription);
    return;
  }
  const priceAmount = items[0].price.unit_amount;
  const amount = typeof priceAmount === 'number' ? priceAmount : null;
  let creditsToAdd = 120;
  let description = "订阅成功赠送积分";

  console.log(`[webhook] 处理订阅积分分配 - priceAmount: ${amount} cents`);

  if (amount === 1690) {
    creditsToAdd = 120;
    description = "月付订阅成功赠送120积分";
    console.log(`[webhook] 识别为月付订阅 ($16.90), 分配 ${creditsToAdd} 积分`);
  } else if (amount === 11880) {
    creditsToAdd = 1800;
    description = "年付订阅成功赠送1800积分";
    console.log(`[webhook] 识别为年付订阅 ($118.80), 分配 ${creditsToAdd} 积分`);
  } else {
    console.warn(`[webhook] 未识别的订阅价格: ${amount} cents, 使用默认积分 ${creditsToAdd}`);
    const interval = items[0].price.recurring?.interval;
    if (interval === 'year') {
      creditsToAdd = 1800;
      description = "年付订阅成功赠送1800积分";
      console.log(`[webhook] 根据间隔类型(年)推断, 分配 ${creditsToAdd} 积分`);
    }
  }

  try {
    // 使用数据库函数发放积分
    console.log(`[webhook] 开始为用户 ${userId} 发放 ${creditsToAdd} 积分`);
    const result = await addBonusCreditsWithTransaction(userId, creditsToAdd, description, {
      subscriptionId: subscription.id,
      priceId: items[0].price.id,
      amount: amount,
      type: "subscription_bonus",
      webhookEventType: "subscription_activated",
    });
    console.log(`[webhook] 订阅积分发放成功:`, {
      userId,
      subscriptionId: subscription.id,
      creditsAdded: creditsToAdd,
      newBalance: result.balance,
      transactionId: result.transactionId,
    });
    // 可选：记录订阅积分到 subscription_credits 表
    const supabase = createServiceClient();
    const { startDate, endDate } = calculateFixedPeriodDates(subscription);
    const { error: subscriptionCreditsError } = await supabase.from('subscription_credits').insert({
      user_id: userId,
      subscription_id: subscription.id,
      credits: creditsToAdd,
      remaining_credits: creditsToAdd,
      start_date: startDate || new Date().toISOString(),
      end_date: endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'active',
    });
    if (subscriptionCreditsError) {
      console.error(`[webhook] 记录订阅积分失败，但不影响积分发放:`, subscriptionCreditsError);
    } else {
      console.log(`[webhook] 订阅积分记录创建成功`);
    }
  } catch (error) {
    console.error(`[webhook] 订阅积分发放失败:`, error);
    throw new Error(`订阅积分发放失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }
}

function calculateFixedPeriodDates(subscription: any) {
  const created = subscription.created;
  const items = subscription.items && Array.isArray(subscription.items.data) ? subscription.items.data : [];
  const interval = items[0]?.price?.recurring?.interval;
  const startDate = new Date(created * 1000);
  let endDate;
  if (interval === 'year') {
    endDate = new Date(startDate.getTime() + 365 * 24 * 60 * 60 * 1000);
  } else {
    // 默认按月
    endDate = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);
  }
  return { startDate: startDate.toISOString(), endDate: endDate.toISOString() };
}

// 工具函数：安全获取周期时间戳
async function getSubscriptionPeriodTimestamps(subscription: any): Promise<{ period_start: number | null, period_end: number | null }> {
  let period_start = subscription.current_period_start || null;
  let period_end = subscription.current_period_end || null;
  if (!period_start || !period_end) {
    for (let i = 0; i < 2; i++) {
      try {
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        const detail = await stripe.subscriptions.retrieve(subscription.id);
        period_start = detail.current_period_start || null;
        period_end = detail.current_period_end || null;
        console.log(`[period] 第${i+1}次拉取 Stripe 订阅详情:`, { subscriptionId: subscription.id, period_start, period_end });
        if (period_start && period_end) break;
        // 延迟500ms后重试
        await new Promise(res => setTimeout(res, 500));
      } catch (e) {
        console.error('[period] 拉取 Stripe 订阅详情失败:', e);
        break;
      }
    }
  }
  if (!period_start || !period_end) {
    console.error('[period] 依然缺少周期时间戳，跳过周期权益写入', { subscriptionId: subscription.id, period_start, period_end });
    return { period_start: null, period_end: null };
  }
  return { period_start, period_end };
}