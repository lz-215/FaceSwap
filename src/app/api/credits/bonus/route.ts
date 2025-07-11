import { NextResponse } from "next/server";
import { createClient } from "~/lib/supabase/server";
import { addBonusCreditsWithTransaction } from "~/api/credits/credit-service";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { amount?: number; reason?: string; metadata?: Record<string, any> };
  const amount = body.amount;
  const reason = body.reason || "奖励积分";
  const metadata = body.metadata || {};
  if (typeof amount !== "number" || amount <= 0) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }
  try {
    const result = await addBonusCreditsWithTransaction(user.id, amount, reason, metadata);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to add bonus credits" }, { status: 500 });
  }
} 