import { NextRequest, NextResponse } from "next/server";
import { getCurrentSupabaseUser } from "~/lib/supabase-auth";
import { db } from "~/db";
import { stripeSubscriptionTable } from "~/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    // 验证用户认证
    const user = await getCurrentSupabaseUser();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // 查询用户的订阅状态
    const subscriptions = await db.query.stripeSubscriptionTable.findMany({
      where: eq(stripeSubscriptionTable.userId, user.id),
    });

    // 检查是否有活跃的订阅
    const hasActiveSubscription = subscriptions.some(
      (sub: typeof stripeSubscriptionTable.$inferSelect) => sub.status === "active"
    );

    return NextResponse.json({
      hasActiveSubscription,
      subscriptions: subscriptions.map((sub: typeof stripeSubscriptionTable.$inferSelect) => ({
        id: sub.id,
        status: sub.status,
        productId: sub.productId,
        subscriptionId: sub.subscriptionId,
        createdAt: sub.createdAt,
        updatedAt: sub.updatedAt,
      })),
    });
  } catch (error) {
    console.error("Failed to check subscription status:", error);
    return NextResponse.json(
      { error: "Failed to check subscription status" },
      { status: 500 }
    );
  }
} 