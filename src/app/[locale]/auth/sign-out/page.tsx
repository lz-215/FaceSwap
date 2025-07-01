import type { Metadata } from "next";

import { SignOutPageClient } from "~/app/[locale]/auth/sign-out/page.client";
import { getCurrentSupabaseUser } from "~/lib/supabase-auth";
import {
  PageHeader,
  PageHeaderDescription,
  PageHeaderHeading,
} from "~/components/page-header";
import { Shell } from "~/components/ui/shell";

export const metadata: Metadata = {
  description: "Sign out of your account",
  metadataBase: new URL(
    process.env.NEXT_SERVER_APP_URL || "http://localhost:3000"
  ),
  title: "Sign out",
};

export default async function SignOutPage() {
  await getCurrentSupabaseUser();

  return (
    <Shell>
      <PageHeader>
        <PageHeaderHeading>Sign out</PageHeaderHeading>
        <PageHeaderDescription>
          Are you sure you want to sign out?
        </PageHeaderDescription>
      </PageHeader>
      <SignOutPageClient />
    </Shell>
  );
}
