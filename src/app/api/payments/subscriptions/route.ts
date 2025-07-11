import { NextRequest, NextResponse } from "next/server";
import { getCurrentSupabaseUser } from "~/lib/supabase-auth";
import { createClient } from "~/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentSupabaseUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await createClient();
    // 改为查 subscription_status_monitor 视图
    const { data, error } = await supabase
      .from("subscription_status_monitor")
      .select("user_id, subscription_id, total_credits, remaining_credits, start_date, end_date, status, stripe_status")
      .eq("user_id", user.id)
      .order("end_date", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 映射为 PolarSubscription 格式
    const subscriptions = (data || []).map((sub) => ({
      id: sub.subscription_id,
      productId: '', // 如有 product_id 可补充
      subscriptionId: sub.subscription_id,
      status: sub.stripe_status || sub.status,
      startDate: sub.start_date,
      endDate: sub.end_date,
      amount: undefined, // 如有积分金额可补充
    }));

    return NextResponse.json({ subscriptions });
  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
} 