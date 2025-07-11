import { NextResponse } from "next/server";
import { createClient } from "~/lib/supabase/server";
import { consumeCreditsWithTransaction } from "~/api/credits/credit-service";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { amount?: number };
  const amount = body.amount;
  if (typeof amount !== "number" || amount <= 0) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }
  const result = await consumeCreditsWithTransaction(user.id, amount);

  return NextResponse.json(result);
}
