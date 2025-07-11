import { NextResponse } from "next/server";
import { createClient } from "~/lib/supabase/server";
import { getUserCreditBalance } from "~/api/credits/credit-service";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const creditBalance = await getUserCreditBalance(user.id);

  return NextResponse.json({
    balance: creditBalance ?? 0,
  });
}
