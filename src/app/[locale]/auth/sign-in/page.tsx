import { getTranslations } from "next-intl/server";
import { SYSTEM_CONFIG } from "~/app";
import { getCurrentSupabaseUserOrRedirect } from "~/lib/supabase-auth";

import { SignInPageClient } from "./page.client";

export default async function SignInPage() {
  await getCurrentSupabaseUserOrRedirect(
    undefined,
    SYSTEM_CONFIG.redirectAfterSignIn,
    true
  );
  const t = await getTranslations("SignIn");

  return (
    <SignInPageClient
      signInTitle={t("signInTitle")}
      signInSubtitle={t("signInSubtitle")}
      githubButton={t("githubButton")}
      googleButton={t("googleButton")}
      githubLoginError={t("githubLoginError")}
      googleLoginError={t("googleLoginError")}
      thirdPartyLoginError={t("thirdPartyLoginError")}
      termsText={t("termsText")}
      termsLink={t("termsLink")}
      andText={t("andText")}
      privacyLink={t("privacyLink")}
    />
  );
}
