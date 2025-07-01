import { NextRequest, NextResponse } from "next/server";
import { stripe } from "~/lib/stripe";
import { db } from "~/db";
import { eq, like } from "drizzle-orm";
import { stripeSubscriptionTable, userTable } from "~/db/schema";
import { addBonusCredits } from "~/api/credits/credit-service";

export async function GET(request: NextRequest) {
  try {
    console.log(`[admin] 查询待处理订阅`);

    // 查询所有以 "pending_" 开头的订阅
    const pendingSubscriptions = await db.query.stripeSubscriptionTable.findMany({
      where: like(stripeSubscriptionTable.userId, "pending_%"),
      orderBy: [stripeSubscriptionTable.createdAt],
    });

    console.log(`[admin] 找到 ${pendingSubscriptions.length} 个待处理订阅`);

    // 获取详细的订阅和客户信息
    const subscriptionsWithDetails = await Promise.all(
      pendingSubscriptions.map(async (sub: any) => {
        try {
          // 获取Stripe订阅详情
          const stripeSubscription = await stripe.subscriptions.retrieve(sub.subscriptionId);
          
          // 获取客户信息
          const customer = await stripe.customers.retrieve(stripeSubscription.customer as string);
          
          return {
            id: sub.id,
            subscriptionId: sub.subscriptionId,
            customerId: sub.customerId,
            status: sub.status,
            createdAt: sub.createdAt,
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
          console.error(`[admin] 获取订阅 ${sub.subscriptionId} 详情失败:`, error);
          return {
            id: sub.id,
            subscriptionId: sub.subscriptionId,
            customerId: sub.customerId,
            status: sub.status,
            createdAt: sub.createdAt,
            error: "获取详情失败",
          };
        }
      })
    );

    return NextResponse.json({
      success: true,
      count: pendingSubscriptions.length,
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

      // 验证用户是否存在
      const user = await db.query.userTable.findFirst({
        where: eq(userTable.id, userId),
      });

      if (!user) {
        return NextResponse.json(
          { error: "用户不存在", success: false },
          { status: 400 }
        );
      }

      // 查找待处理的订阅
      const pendingSubscription = await db.query.stripeSubscriptionTable.findFirst({
        where: eq(stripeSubscriptionTable.subscriptionId, subscriptionId),
      });

      if (!pendingSubscription) {
        return NextResponse.json(
          { error: "订阅不存在", success: false },
          { status: 400 }
        );
      }

      // 更新订阅记录
      await db
        .update(stripeSubscriptionTable)
        .set({
          userId: userId,
          updatedAt: new Date(),
        })
        .where(eq(stripeSubscriptionTable.subscriptionId, subscriptionId));

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
