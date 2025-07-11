import { NextResponse } from "next/server";
import { createClient } from "~/lib/supabase/server";
import { getUserCreditTransactions } from "~/api/credits/credit-service";

export async function GET(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") || "10", 10);
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  const transactions = await getUserCreditTransactions(user.id, limit, offset);

  return NextResponse.json({ transactions });
}
