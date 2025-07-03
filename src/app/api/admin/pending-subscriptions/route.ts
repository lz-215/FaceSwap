import { NextRequest, NextResponse } from "next/server";
import { stripe } from "~/lib/stripe";
import { createClient } from "~/lib/supabase/server";
import { addBonusCreditsWithTransaction } from "~/api/credits/credit-service";
import type { Stripe } from "stripe";

interface PendingSubscriptionRequest {
  subscriptionId: string;
  userId: string;
  action: 'link' | 'cancel';
}

export async function GET(request: NextRequest) {
  try {
    console.log(`[admin] 查询待处理订阅`);
    
    const supabase = await createClient();

    // 查询所有以 "pending_" 开头的订阅
    const { data: pendingSubscriptions, error } = await supabase
      .from('stripe_subscription')
      .select('*')
      .like('user_id', 'pending_%')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`查询订阅失败: ${error.message}`);
    }

    console.log(`[admin] 找到 ${pendingSubscriptions?.length || 0} 个待处理订阅`);

    // 获取详细的订阅和客户信息
    const subscriptionsWithDetails = await Promise.all(
      (pendingSubscriptions || []).map(async (sub: any) => {
        try {
          // 获取Stripe订阅详情
          const subscription = await stripe.subscriptions.retrieve(sub.subscription_id) as Stripe.Subscription;
          
          // 获取客户信息
          const customer = await stripe.customers.retrieve(subscription.customer as string);
          
          return {
            id: sub.id,
            subscriptionId: sub.subscription_id,
            customerId: sub.customer_id,
            status: sub.status,
            createdAt: sub.created_at,
            metadata: sub.metadata,
            stripeSubscription: {
              id: subscription.id,
              status: subscription.status,
              startDate: subscription.start_date ? new Date(subscription.start_date * 1000).toISOString() : null,
              endDate: subscription.ended_at ? new Date(subscription.ended_at * 1000).toISOString() : null,
              items: subscription.items.data.map(item => ({
                id: item.id,
                price: item.price && {
                  id: item.price.id,
                  unit_amount: item.price.unit_amount,
                  currency: item.price.currency,
                },
              })),
            },
            customer: customer.deleted ? null : {
              id: customer.id,
              email: customer.email,
              name: customer.name,
              metadata: customer.metadata,
            },
          };
        } catch (error) {
          console.error(`[admin] 获取订阅 ${sub.subscription_id} 详情失败:`, error);
          return {
            id: sub.id,
            subscriptionId: sub.subscription_id,
            customerId: sub.customer_id,
            status: sub.status,
            createdAt: sub.created_at,
            metadata: sub.metadata,
            error: "获取详情失败",
          };
        }
      })
    );

    return NextResponse.json({
      success: true,
      count: pendingSubscriptions?.length || 0,
      subscriptions: subscriptionsWithDetails,
    });

  } catch (error) {
    console.error("[admin] 获取待处理订阅失败:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "获取待处理订阅失败", success: false },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { subscriptionId, userId, action } = await request.json() as PendingSubscriptionRequest;
    
    if (!subscriptionId || !userId || !action) {
      return NextResponse.json(
        { error: "缺少必要参数", success: false },
        { status: 400 }
      );
    }

    console.log(`[admin] 处理待处理订阅: ${subscriptionId}, 用户: ${userId}, 操作: ${action}`);

    const supabase = await createClient();

    // 获取订阅信息
    const { data: subscription, error: subError } = await supabase
      .from('stripe_subscription')
      .select('*')
      .eq('subscription_id', subscriptionId)
      .single();

    if (subError || !subscription) {
      throw new Error(`获取订阅信息失败: ${subError?.message || '未找到订阅'}`);
    }

    // 验证用户ID
    const { data: user, error: userError } = await supabase
      .from('user')
      .select('id, email')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      throw new Error(`验证用户失败: ${userError?.message || '未找到用户'}`);
    }

    switch (action) {
      case 'link': {
        // 1. 更新订阅记录
        const { error: updateError } = await supabase
          .from('stripe_subscription')
          .update({
            user_id: userId,
            updated_at: new Date().toISOString(),
            metadata: {
              ...subscription.metadata,
              linkedBy: 'admin',
              linkedAt: new Date().toISOString(),
            },
          })
          .eq('subscription_id', subscriptionId);

        if (updateError) {
          throw new Error(`更新订阅失败: ${updateError.message}`);
        }

        // 2. 更新或创建 stripe_customer 记录
        const { error: customerError } = await supabase
          .from('stripe_customer')
          .upsert({
            id: subscription.id,
            user_id: userId,
            customer_id: subscription.customer_id,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' });

        if (customerError) {
          throw new Error(`更新客户关联失败: ${customerError.message}`);
        }

        // 3. 更新 Stripe 客户元数据
        try {
          await stripe.customers.update(subscription.customer_id, {
            metadata: {
              userId: userId,
              linkedBy: 'admin',
              linkedAt: new Date().toISOString(),
            },
          });
        } catch (error) {
          console.error(`[admin] 更新Stripe客户元数据失败:`, error);
          // 不中断流程
        }

        // 4. 如果是活跃订阅，添加奖励积分
        if (subscription.status === 'active') {
          try {
            // 根据订阅类型给予奖励积分
            const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
            const priceAmount = stripeSubscription.items.data[0]?.price?.unit_amount;
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

            await addBonusCreditsWithTransaction(userId, creditsToAdd, description, {
              subscriptionId: subscriptionId,
              bonusType: "subscription_welcome",
              amount: amount,
              addedBy: "admin",
            });
          } catch (error) {
            console.error(`[admin] 添加订阅奖励积分失败:`, error);
            // 不中断流程
          }
        }

        return NextResponse.json({
          success: true,
          message: "订阅已成功关联到用户",
          subscription: {
            id: subscription.id,
            subscriptionId: subscription.subscription_id,
            userId: userId,
            status: subscription.status,
          },
        });
      }

      case 'cancel': {
        // 取消订阅
        try {
          await stripe.subscriptions.cancel(subscriptionId);
        } catch (error) {
          console.error(`[admin] 取消Stripe订阅失败:`, error);
          // 继续处理本地记录
        }

        // 更新本地记录
        const { error: updateError } = await supabase
          .from('stripe_subscription')
          .update({
            status: 'cancelled',
            updated_at: new Date().toISOString(),
            metadata: {
              ...subscription.metadata,
              cancelledBy: 'admin',
              cancelledAt: new Date().toISOString(),
            },
          })
          .eq('subscription_id', subscriptionId);

        if (updateError) {
          throw new Error(`更新订阅状态失败: ${updateError.message}`);
        }

        return NextResponse.json({
          success: true,
          message: "订阅已取消",
          subscription: {
            id: subscription.id,
            subscriptionId: subscription.subscription_id,
            status: 'cancelled',
          },
        });
      }

      default:
        return NextResponse.json(
          { error: "不支持的操作", success: false },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error("[admin] 处理待处理订阅失败:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "处理待处理订阅失败", success: false },
      { status: 500 }
    );
  }
} 
