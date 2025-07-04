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
    
    // 如果没有从客户元数据获取到userId，尝试多种方式查找
    if (!userId) {
      console.log(`[webhook] 尝试多种方式查找用户关联`);
      
      // 1. 通过customer_id查找
      const { data: userRecord, error: userError } = await supabase
        .from("user")
        .select("id, created_at")
        .eq("customer_id", customerId)
        .single();

      if (userRecord?.id) {
        userId = userRecord.id;
        console.log(`[webhook] 通过customer_id找到用户: ${userId}, 记录创建时间: ${userRecord.created_at}`);
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
          
          // 自动补全 stripe_customer 绑定
          try {
            await supabase.from("stripe_customer").upsert({
              id: createId(),
              user_id: userId,
              customer_id: customerId,
              updated_at: new Date().toISOString(),
              created_at: new Date().toISOString(),
            }, { onConflict: "user_id" });
            console.log(`[webhook] 已自动补全 stripe_customer 绑定: user_id=${userId}, customer_id=${customerId}`);
            
            // 新增：同步 user 表 customer_id 字段
            const { error: userUpdateError } = await supabase
              .from("user")
              .update({ customer_id: customerId, updated_at: new Date().toISOString() })
              .eq("id", userId);
            if (userUpdateError) {
              console.error(`[webhook] 同步user表customer_id失败:`, userUpdateError);
            }

            // 更新客户元数据
            if (customer && !customer.deleted) {
              await stripe.customers.update(customerId, {
                metadata: {
                  ...customer.metadata,
                  userId: user.id,
                  linkedBy: "email_match",
                  linkedAt: new Date().toISOString(),
                },
              });
              console.log(`[webhook] 已更新客户metadata`);
            }
          } catch (err: any) {
            if (err.code === '23505') {
              const { error: updateError } = await supabase
                .from("stripe_customer")
                .update({
                  customer_id: customerId,
                  updated_at: new Date().toISOString(),
                })
                .eq("user_id", userId);
              
              if (updateError) {
                console.error(`[webhook] 更新stripe_customer记录失败:`, updateError);
                throw updateError;
              }
            } else {
              console.error(`[webhook] 自动补全 stripe_customer 绑定失败`, err);
              throw err;
            }
          }
        }
      }
      
      // 3. 尝试从订阅元数据中获取
      if (!userId && subscription.metadata?.userId) {
        console.log(`[webhook] 步骤5: 从订阅metadata中获取用户ID: ${subscription.metadata.userId}`);
        
        // 验证用户ID是否有效
        const { data: user, error: userError } = await supabase
          .from("user")
          .select("id, email, created_at")
          .eq("id", subscription.metadata.userId)
          .single();
          
        console.log(`[webhook] 验证订阅metadata中的用户ID结果:`, {
          found: !!user,
          error: userError,
          userId: subscription.metadata.userId,
          userEmail: user?.email,
          createdAt: user?.created_at,
        });

        if (user) {
          userId = user.id;
          console.log(`[webhook] 验证订阅metadata中的用户ID有效: ${userId}`);
        } else {
          console.warn(`[webhook] 订阅metadata中的用户ID无效: ${subscription.metadata.userId}, 错误:`, userError);
        }
      }
    }

    if (!userId) {
      // 详细日志
      console.warn(`[webhook] 所有方法都无法找到用户ID，无法同步订阅状态: ${subscription.id}`);
      console.warn('[webhook] 详细上下文:', {
        subscriptionId: subscription.id,
        customerId,
        customerEmail: customer?.email,
        subscriptionMetadata: subscription.metadata,
      });
      // 尝试通过 customer.email 自动补全
      if (customer?.email) {
        const { data: userByEmail, error: userByEmailError } = await supabase
          .from('user')
          .select('id')
          .eq('email', customer.email)
          .single();
        if (userByEmail) {
          userId = userByEmail.id;
          // 自动补全 user 表 customer_id 字段
          const { error: updateUserError } = await supabase
            .from('user')
            .update({ customer_id: customerId, updated_at: new Date().toISOString() })
            .eq('id', userId);
          if (updateUserError) {
            console.error('[webhook] 自动补全 user.customer_id 失败:', updateUserError);
          } else {
            console.log('[webhook] 已通过 email 自动补全 user.customer_id:', { userId, customerId });
          }
        } else {
          console.warn('[webhook] 通过 email 自动补全 userId 失败:', userByEmailError);
        }
      }
      // 尝试通过 subscription.metadata.userEmail 自动补全
      if (!userId && subscription.metadata?.userEmail) {
        const { data: userByMetaEmail, error: userByMetaEmailError } = await supabase
          .from('user')
          .select('id')
          .eq('email', subscription.metadata.userEmail)
          .single();
        if (userByMetaEmail) {
          userId = userByMetaEmail.id;
          const { error: updateUserError } = await supabase
            .from('user')
            .update({ customer_id: customerId, updated_at: new Date().toISOString() })
            .eq('id', userId);
          if (updateUserError) {
            console.error('[webhook] 自动补全 user.customer_id (metadata) 失败:', updateUserError);
          } else {
            console.log('[webhook] 已通过 metadata.userEmail 自动补全 user.customer_id:', { userId, customerId });
          }
        } else {
          console.warn('[webhook] 通过 metadata.userEmail 自动补全 userId 失败:', userByMetaEmailError);
        }
      }
      if (!userId) {
        throw new Error('无法找到用户ID，无法同步订阅状态');
      }
    }

    // 同步 user 表 subscription_status 字段
    const { error: statusUpdateError } = await supabase
      .from("user")
      .update({ subscription_status: subscription.status, updated_at: new Date().toISOString() })
      .eq("id", userId);
    if (statusUpdateError) {
      console.error(`[webhook] 同步user表subscription_status失败:`, statusUpdateError);
    } else {
      console.log(`[webhook] 已同步user表subscription_status: ${subscription.status}`);
    }

    // 只有订阅为 active 时才奖励积分
    if (subscription.status === 'active') {
      try {
        await handleSubscriptionBonusCredits(subscription, userId);
        console.log(`[webhook] 已为用户 ${userId} 发放订阅奖励积分`);
      } catch (bonusError) {
        console.error(`[webhook] 订阅奖励积分发放失败:`, bonusError);
      }
    } else {
      console.log(`[webhook] 订阅状态为 ${subscription.status}，未发放奖励积分`);
    }

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

    console.log(`[webhook] 订阅奖励积分: userId=${userId}, creditsToAdd=${creditsToAdd}, description=${description}, amount=${amount}`);
    await addBonusCreditsWithTransaction(userId, creditsToAdd, description, {
      subscriptionId: subscription.id,
      bonusType: "subscription_welcome",
      amount,
      addedBy: "webhook",
    });
  } catch (error) {
    console.error(`[webhook] 订阅奖励积分发放失败:`, error);
    throw error;
  }
}