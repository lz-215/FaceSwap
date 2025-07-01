
import { getCurrentSupabaseUser } from "~/lib/supabase-auth";

import { DashboardPageClient } from "./page.client";

export default async function DashboardPage() {
  const user = await getCurrentSupabaseUser();

  return <DashboardPageClient user={user} />;
}
