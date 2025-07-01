"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { supabaseAuth } from "~/lib/supabase-auth-client";
import { Button } from "~/components/ui/button";

export function LogoutButton() {
  const t = useTranslations("Navigation");
  const [isLoading, setIsLoading] = useState(false);

  const logout = async () => {
    try {
      setIsLoading(true);
      await supabaseAuth.signOutWithRedirect();
    } catch (error) {
      console.error("Logout error:", error);
      setIsLoading(false);
    }
  };

  return (
    <Button onClick={logout} disabled={isLoading} variant="destructive">
      {isLoading ? "Signing out..." : t("signOut")}
    </Button>
  );
}
