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
    // 直接从 user 表获取订阅状态
    const { data: userRow, error } = await supabase
      .from("user")
      .select("subscription_status")
      .eq("id", user.id)
      .single();

    console.log('[subscription-status] 查到的 userRow:', userRow);

    if (error) {
      console.error("获取订阅状态失败:", error);
      return NextResponse.json(
        { error: "获取订阅状态失败" },
        { status: 500 }
      );
    }

    const status = userRow?.subscription_status || null;
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