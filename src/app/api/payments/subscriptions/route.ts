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
    const { data, error } = await supabase
      .from("stripe_subscription")
      .select("id, product_id, subscription_id, status, start_date, end_date, amount")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const subscriptions = (data || []).map((sub) => ({
      id: sub.id,
      productId: sub.product_id,
      subscriptionId: sub.subscription_id,
      status: sub.status,
      startDate: sub.start_date,
      endDate: sub.end_date,
      amount: sub.amount,
    }));

    return NextResponse.json({ subscriptions });
  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
} 