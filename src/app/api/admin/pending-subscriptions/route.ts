import { NextRequest, NextResponse } from "next/server";
import { stripe } from "~/lib/stripe";
import { createClient } from "~/lib/supabase/server";
import { addBonusCredits } from "~/api/credits/credit-service";

export async function GET(request: NextRequest) {
  try {
    console.log(`[admin] 查询待处理订阅`);
    
    const supabase = await createClient();

    // 查询所有以 "pending_" 开头的订阅
    const { data: pendingSubscriptions, error } = await supabase
      .from('stripe_subscription')
      .select('*')
      .like('user_id', 'pending_%')
      .order('created_at');

    if (error) {
      throw new Error(`查询订阅失败: ${error.message}`);
    }

    console.log(`[admin] 找到 ${pendingSubscriptions?.length || 0} 个待处理订阅`);

    // 获取详细的订阅和客户信息
    const subscriptionsWithDetails = await Promise.all(
      (pendingSubscriptions || []).map(async (sub: any) => {
        try {
          // 获取Stripe订阅详情
          const stripeSubscription = await stripe.subscriptions.retrieve(sub.subscription_id);
          
          // 获取客户信息
          const customer = await stripe.customers.retrieve(stripeSubscription.customer as string);
          
          return {
            id: sub.id,
            subscriptionId: sub.subscription_id,
            customerId: sub.customer_id,
            status: sub.status,
            createdAt: sub.created_at,
            stripeSubscription: {
              id: stripeSubscription.id,
              status: stripeSubscription.status,
              current_period_start: (stripeSubscription as any).current_period_start,
              current_period_end: (stripeSubscription as any).current_period_end,
              items: stripeSubscription.items.data.map(item => ({
                id: item.id,
                price: {
                  id: item.price.id,
                  unit_amount: (item.price as any).unit_amount,
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
    console.error("[admin] 查询待处理订阅失败", error);
    
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "查询失败",
        success: false,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action, subscriptionId, userId, customerId } = await request.json() as {
      action: string;
      subscriptionId: string;
      userId: string;
      customerId: string;
    };

    if (action === "link-subscription") {
      // 手动关联订阅到用户
      if (!subscriptionId || !userId) {
        return NextResponse.json(
          { error: "subscriptionId 和 userId 都是必需的", success: false },
          { status: 400 }
        );
      }

      console.log(`[admin] 手动关联订阅 ${subscriptionId} 到用户 ${userId}`);

      const supabase = await createClient();

      // 验证用户是否存在
      const { data: user, error: userError } = await supabase
        .from('user')
        .select('*')
        .eq('id', userId)
        .single();

      if (userError || !user) {
        return NextResponse.json(
          { error: "用户不存在", success: false },
          { status: 400 }
        );
      }

      // 查找待处理的订阅
      const { data: pendingSubscription, error: subscriptionError } = await supabase
        .from('stripe_subscription')
        .select('*')
        .eq('subscription_id', subscriptionId)
        .single();

      if (subscriptionError || !pendingSubscription) {
        return NextResponse.json(
          { error: "订阅不存在", success: false },
          { status: 400 }
        );
      }

      // 更新订阅记录
      const { error: updateError } = await supabase
        .from('stripe_subscription')
        .update({
          user_id: userId,
          updated_at: new Date().toISOString(),
        })
        .eq('subscription_id', subscriptionId);

      if (updateError) {
        throw new Error(`更新订阅失败: ${updateError.message}`);
      }

      // 如果提供了customerId，也更新Stripe客户的metadata
      if (customerId) {
        try {
          await stripe.customers.update(customerId, {
            metadata: {
              userId: userId,
              linkedBy: "admin",
              linkedAt: new Date().toISOString(),
            },
          });
          console.log(`[admin] 已更新客户 ${customerId} 的metadata`);
        } catch (error) {
          console.warn(`[admin] 更新客户metadata失败:`, error);
        }
      }

      // 如果订阅是活跃状态，补发积分
      const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
      if (stripeSubscription.status === "active") {
        try {
          // 计算应该给的积分
          const amount = (stripeSubscription.items.data[0]?.price as any)?.unit_amount;
          let creditsToAdd = 120; // 默认月付积分
          let description = "补发订阅积分";

          if (amount === 1690) {
            creditsToAdd = 120;
            description = "补发月付订阅积分";
          } else if (amount === 990) {
            creditsToAdd = 1800;
            description = "补发年付订阅积分";
          }

          console.log(`[admin] 为用户 ${userId} 补发 ${creditsToAdd} 积分`);

          const result = await addBonusCredits(
            userId,
            creditsToAdd,
            description,
            {
              subscriptionId: subscriptionId,
              customerId: customerId,
              type: "admin_backfill",
              linkedBy: "admin",
              originalAmount: amount,
            }
          );

          console.log(`[admin] 积分补发成功`, {
            userId,
            creditsAdded: creditsToAdd,
            newBalance: result.balance,
            transactionId: result.transactionId,
          });

          return NextResponse.json({
            success: true,
            message: `订阅已关联到用户 ${userId}，并补发了 ${creditsToAdd} 积分`,
            data: {
              subscriptionId,
              userId,
              creditsAdded: creditsToAdd,
              newBalance: result.balance,
              transactionId: result.transactionId,
            },
          });

        } catch (error) {
          console.error(`[admin] 补发积分失败:`, error);
          
          return NextResponse.json({
            success: true,
            message: `订阅已关联到用户 ${userId}，但积分补发失败: ${error instanceof Error ? error.message : '未知错误'}`,
            data: {
              subscriptionId,
              userId,
              creditError: error instanceof Error ? error.message : '未知错误',
            },
          });
        }
      } else {
        return NextResponse.json({
          success: true,
          message: `订阅已关联到用户 ${userId}，但订阅状态不是活跃状态 (${stripeSubscription.status})，未补发积分`,
          data: {
            subscriptionId,
            userId,
            subscriptionStatus: stripeSubscription.status,
          },
        });
      }
    }

    return NextResponse.json(
      { error: "不支持的操作", success: false },
      { status: 400 }
    );

  } catch (error) {
    console.error("[admin] 操作失败:", error);
    
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "操作失败",
        success: false,
      },
      { status: 500 }
    );
  }
} 
