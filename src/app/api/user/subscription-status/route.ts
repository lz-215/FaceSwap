import { NextRequest, NextResponse } from "next/server";
import { getCurrentSupabaseUser } from "~/lib/supabase-auth";
import { createClient } from "~/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentSupabaseUser();
    
    if (!user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const supabase = await createClient();
    
    // 获取用户的订阅状态
    const { data: subscriptions, error } = await supabase
      .from("stripe_subscription")
      .select("*")
      .eq("user_id", user.id);

    if (error) {
      console.error("获取订阅状态失败:", error);
      return NextResponse.json(
        { error: "获取订阅状态失败" },
        { status: 500 }
      );
    }

    // 检查是否有活跃订阅
    const activeSubscription = subscriptions?.find(
      (sub: any) => sub.status === "active"
    );

    return NextResponse.json({
      hasActiveSubscription: !!activeSubscription,
      subscription: activeSubscription || null,
      subscriptions: subscriptions || [],
    });
  } catch (error) {
    console.error("获取订阅状态错误:", error);
    return NextResponse.json(
      { error: "内部服务器错误" },
      { status: 500 }
    );
  }
} 