import { NextRequest, NextResponse } from "next/server";
import { getCurrentSupabaseUser } from "~/lib/supabase-auth";
import { createClient } from "~/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentSupabaseUser();
    
    console.log('[subscription-status] 当前 user.id:', user?.id);
    if (!user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const supabase = await createClient();
    // 从 subscription_status_monitor 视图获取 stripe_subscription_status
    const { data: monitorRow, error } = await supabase
      .from("subscription_status_monitor")
      .select("stripe_subscription_status")
      .eq("user_id", user.id)
      .order("end_date", { ascending: false })
      .limit(1)
      .single();

    console.log('[subscription-status] 查到的 monitorRow:', monitorRow);

    if (error) {
      console.error("获取订阅状态失败:", error);
      return NextResponse.json(
        { error: "获取订阅状态失败" },
        { status: 500 }
      );
    }

    const status = monitorRow?.stripe_subscription_status || null;
    return NextResponse.json({
      hasActiveSubscription: status === 'active',
      status,
    });
  } catch (error) {
    console.error("获取订阅状态错误:", error);
    return NextResponse.json(
      { error: "内部服务器错误" },
      { status: 500 }
    );
  }
} 