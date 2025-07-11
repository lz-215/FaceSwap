"use client";

import { CreditCard } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCredits } from "~/lib/hooks/useCredits";
import { cn } from "~/lib/utils";

interface CreditBalanceProps {
  className?: string;
}

export function CreditBalance({ className }: CreditBalanceProps) {
  const t = useTranslations("Navigation");
  const { balance, isLoading } = useCredits();

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-50 to-purple-50 px-3 py-2",
        "dark:from-blue-950/50 dark:to-purple-950/50",
        className
      )}
    >
      <CreditCard className="h-4 w-4 text-blue-600 dark:text-blue-400" />
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
        {t("credits")}:
      </span>
      <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
        {isLoading ? "..." : balance}
      </span>
    </div>
  );
}
