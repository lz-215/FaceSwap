import type { NextRequest } from "next/server";
import type Stripe from "stripe";
import { createId } from "@paralleldrive/cuid2";

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

  // 检查是否是积分充值
  if (metadata && metadata.type === "credit_recharge") {
    let { rechargeId, userId, credits } = metadata;
    
    console.log(`[webhook] 积分充值初始数据:`, {
      rechargeId,
      userId,
      credits,
      hasCustomerId: !!paymentIntent.customer,
      customerId: paymentIntent.customer,
    });
    
    if (!rechargeId) {
      console.error(`[webhook] 积分充值支付缺少 rechargeId: ${paymentIntent.id}`);
      throw new Error("积分充值支付缺少 rechargeId");
    }

    // 如果没有userId，尝试通过其他方式查找
    if (!userId) {
      const supabase = await createClient();
      const customerId = paymentIntent.customer as string;
      console.log(`[webhook] 开始查找用户ID - customerId: ${customerId}`);

      if (customerId) {
        // 1. 通过customer_id查找
        console.log(`[webhook] 步骤1: 通过customer_id查找用户`);
        const { data: stripeCustomer, error: stripeCustomerError } = await supabase
          .from("stripe_customer")
          .select("user_id, created_at")
          .eq("customer_id", customerId)
          .single();
        
        console.log(`[webhook] stripe_customer 查找结果:`, {
          found: !!stripeCustomer,
          error: stripeCustomerError,
          customerId,
          userId: stripeCustomer?.user_id,
          createdAt: stripeCustomer?.created_at,
        });

        if (stripeCustomer?.user_id) {
          userId = stripeCustomer.user_id;
          console.log(`[webhook] 通过customer_id找到用户: ${userId}, 记录创建时间: ${stripeCustomer.created_at}`);
        } else {
          console.log(`[webhook] 通过customer_id未找到用户，错误:`, stripeCustomerError);
          
          // 2. 如果有客户邮箱，尝试通过邮箱匹配
          console.log(`[webhook] 步骤2: 尝试通过Stripe API获取客户信息`);
          try {
            const customerResponse = await stripe.customers.retrieve(customerId);
            const customer = customerResponse as Stripe.Customer;
            console.log(`[webhook] Stripe客户信息:`, {
              id: customer.id,
              email: customer.email,
              name: customer.name,
              metadata: customer.metadata,
              deleted: (customerResponse as any).deleted,
            });
            
            if (customer && !(customerResponse as any).deleted && customer.email) {
              console.log(`[webhook] 步骤3: 通过email匹配用户: ${customer.email}`);
              
              const { data: user, error: userError } = await supabase
                .from("user")
                .select("id, email, created_at")
                .eq("email", customer.email)
                .single();
              
              console.log(`[webhook] 用户查找结果:`, {
                found: !!user,
                error: userError,
                email: customer.email,
                userId: user?.id,
                createdAt: user?.created_at,
              });
              
              if (user) {
                userId = user.id;
                console.log(`[webhook] 通过email找到用户: ${userId}, 用户创建时间: ${user.created_at}`);
                
                // 自动补全 stripe_customer 绑定
                console.log(`[webhook] 步骤4: 开始创建stripe_customer绑定`);
                try {
                  const newRecord = {
                    id: createId(),
                    user_id: userId,
                    customer_id: customerId,
                    updated_at: new Date().toISOString(),
                    created_at: new Date().toISOString(),
                  };
                  console.log(`[webhook] 准备插入stripe_customer记录:`, newRecord);
                  
                  const { data: upsertResult, error: upsertError } = await supabase
                    .from("stripe_customer")
                    .upsert(newRecord, { onConflict: "user_id" });
                  
                  console.log(`[webhook] stripe_customer upsert结果:`, {
                    success: !upsertError,
                    data: upsertResult,
                    error: upsertError,
                  });

                  if (upsertError) {
                    console.error(`[webhook] stripe_customer绑定失败:`, {
                      error: upsertError,
                      errorCode: upsertError.code,
                      errorMessage: upsertError.message,
                      details: upsertError.details,
                    });
                  }
                } catch (err) {
                  console.error(`[webhook] 创建stripe_customer绑定失败:`, err);
                }
              } else {
                console.log(`[webhook] 通过email未找到用户: ${customer.email}, 错误:`, userError);
              }
            } else {
              console.log(`[webhook] Stripe客户无效或已删除:`, {
                customerId,
                isDeleted: (customerResponse as any).deleted,
                hasEmail: !!customer?.email,
              });
            }
          } catch (stripeError) {
            console.error(`[webhook] 获取Stripe客户信息失败:`, stripeError);
          }
        }
      } else {
        console.log(`[webhook] PaymentIntent中没有customer_id`);
      }
    } else {
      console.log(`[webhook] 已从metadata中获取到userId: ${userId}`);
    }

    if (!userId) {
      console.error(`[webhook] 所有方法都无法找到用户ID:`, {
        paymentIntentId: paymentIntent.id,
        customerId: paymentIntent.customer,
        metadata,
      });
      await recordFailedPayment(paymentIntent.id, rechargeId, new Error("无法找到用户ID"));
      throw new Error("无法找到用户ID");
    }

    console.log(`[webhook] 开始处理积分充值: 用户=${userId}, 充值ID=${rechargeId}, 积分=${credits}`);

    try {
      // 优先使用 RPC 函数处理支付成功
      console.log(`[webhook] 调用 processPaymentWithRPC`);
      const result = await processPaymentWithRPC(paymentIntent.id, rechargeId);
      console.log(`[webhook] processPaymentWithRPC 返回:`, result);

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
      console.log(`[webhook] 尝试使用备用方法 handleCreditRechargeWithTransaction: ${rechargeId}`);
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
    
    // 如果没有从客户元数据获取到userId，尝试多种方式查找
    if (!userId) {
      console.log(`[webhook] 尝试多种方式查找用户关联`);
      
      // 1. 通过customer_id查找
      const { data: stripeCustomer } = await supabase
        .from("stripe_customer")
        .select("user_id")
        .eq("customer_id", customerId)
        .single();

      if (stripeCustomer?.user_id) {
        userId = stripeCustomer.user_id;
        console.log(`[webhook] 通过customer_id找到用户: ${userId}`);
        
        // 更新客户元数据
        if (customer && !customer.deleted) {
          try {
            await stripe.customers.update(customerId, {
              metadata: {
                ...customer.metadata,
                userId: stripeCustomer.user_id,
                linkedBy: "customer_id_match",
                linkedAt: new Date().toISOString(),
              },
            });
            console.log(`[webhook] 已更新客户metadata`);
          } catch (error) {
            console.error(`[webhook] 更新客户metadata失败`, error);
          }
        }
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
      console.warn(`[webhook] 所有方法都无法找到用户ID，记录为待处理订阅: ${subscription.id}`);
      
      // 记录待处理订阅到数据库
      const pendingSubscription = {
        id: createId(),
        user_id: `pending_${customerId}`, // 使用特殊的用户ID格式标记待处理
        customer_id: customerId,
        subscription_id: subscription.id,
        product_id: productId,
        status: subscription.status,
        metadata: {
          customerEmail: customer?.email || null,
          customerName: customer?.name || null,
          customerMetadata: customer?.metadata || null,
          subscriptionMetadata: subscription.metadata || null,
          pendingReason: "user_not_found",
          createdAt: new Date().toISOString(),
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      console.log(`[webhook] 准备插入待处理订阅记录:`, pendingSubscription);

      const { error: insertError } = await supabase
        .from("stripe_subscription")
        .insert(pendingSubscription);

      if (insertError) {
        console.error(`[webhook] 记录待处理订阅失败:`, {
          error: insertError,
          errorCode: insertError.code,
          errorMessage: insertError.message,
          details: insertError.details,
        });
        throw insertError;
      }

    }

    // 同步订阅状态到数据库
    const { error: syncError } = await supabase
      .from("stripe_subscription")
      .upsert({
        id: subscription.id,
        user_id: userId,
        customer_id: customerId,
        subscription_id: subscription.id,
        product_id: productId,
        status: subscription.status,
        metadata: {
          linkedBy: customer?.metadata?.linkedBy || null,
          linkedAt: customer?.metadata?.linkedAt || new Date().toISOString(),
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "subscription_id" });

    if (syncError) {
      console.error(`[webhook] 同步订阅状态失败:`, syncError);
      throw syncError;
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
