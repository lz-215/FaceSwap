"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { useMounted } from "~/lib/hooks/use-mounted";
import { supabaseAuth } from "~/lib/supabase-auth-client";
import { cn } from "~/lib/utils";
import { Button, buttonVariants } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";

export function SignOutPageClient() {
  const router = useRouter();
  const mounted = useMounted();
  const t = useTranslations("Navigation");
  const tCommon = useTranslations("Common");

  const handlePageBack = async () => {
    router.back();
  };

  const handleSignOut = async () => {
    try {
      await supabaseAuth.signOutWithRedirect();
    } catch (error) {
      console.error("Sign out error:", error);
    }
  };

  return (
    <div
      className={`
        flex w-auto flex-col-reverse justify-center gap-2
        sm:flex-row
      `}
    >
      <Button onClick={handlePageBack} size="default" variant="outline">
        {tCommon("goBack", { defaultMessage: "Go back" })}
        <span className="sr-only">
          {tCommon("previousPage", { defaultMessage: "Previous page" })}
        </span>
      </Button>
      {mounted ? (
        <Button onClick={handleSignOut} size="default" variant="secondary">
          {t("signOut")}
          <span className="sr-only">
            {tCommon("signOutAction", {
              defaultMessage: "This action will log you out of your account.",
            })}
          </span>
        </Button>
      ) : (
        <Skeleton
          className={cn(
            buttonVariants({ size: "default", variant: "secondary" }),
            "bg-muted text-muted-foreground"
          )}
        >
          {t("signOut")}
        </Skeleton>
      )}
    </div>
  );
}
