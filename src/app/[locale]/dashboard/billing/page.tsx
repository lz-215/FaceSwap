import { getCurrentSupabaseUser } from "~/lib/supabase-auth";

import { BillingPageClient } from "./page.client";

export default async function BillingPage() {
  const user = await getCurrentSupabaseUser();

  if (!user) {
    return null;
  }

  return <BillingPageClient user={user} />;
}
