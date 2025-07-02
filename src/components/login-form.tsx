"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { createClient } from "~/lib/supabase/client";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";

// 获取正确的重定向URL
const getRedirectUrl = (path: string) => {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (typeof window !== "undefined" ? window.location.origin : "");
  return `${baseUrl}${path}`;
};

export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [error, setError] = useState<null | string>(null);
  const [isLoading, setIsLoading] = useState(false);
  const t = useTranslations("Auth");

  const handleSocialLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        options: {
          redirectTo: getRedirectUrl("/auth/oauth?next=/protected"),
        },
        provider: "github",
      });

      if (error) throw error;
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred");
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">
            {t("welcome", { defaultMessage: "Welcome!" })}
          </CardTitle>
          <CardDescription>{t("subTitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSocialLogin}>
            <div className="flex flex-col gap-6">
              {error && <p className="text-destructive-500 text-sm">{error}</p>}
              <Button className="w-full" disabled={isLoading} type="submit">
                {isLoading
                  ? t("redirecting")
                  : t("continueWithGithub", {
                      defaultMessage: "Continue with Github",
                    })}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
