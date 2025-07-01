import type { Metadata } from "next";

import { getTranslations } from "next-intl/server";

import { getCurrentSupabaseUserOrRedirect } from "~/lib/supabase-auth";
import { CreditBalance } from "~/components/payment/credit-balance";
import { CreditTransactions } from "~/components/payment/credit-transactions";

export default async function CreditsPage() {
  const t = await getTranslations("Payment");
  await getCurrentSupabaseUserOrRedirect();
  // getCurrentSupabaseUserOrRedirect 会自动重定向未登录用户

  return (
    <div className="container space-y-8 py-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">{t("credits")}</h1>
        <p className="text-muted-foreground">{t("creditsDescription")}</p>
      </div>

      <div className="grid gap-8">
        <div className="rounded-lg border bg-card p-6">
          <div className="flex flex-col gap-4">
            <h2 className="text-xl font-semibold">{t("currentBalance")}</h2>
            <CreditBalance className="text-lg" />
          </div>
        </div>

        <div className="rounded-lg border bg-card p-6">
          <CreditTransactions />
        </div>
      </div>
    </div>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Payment");

  return {
    title: t("credits"),
  };
}
