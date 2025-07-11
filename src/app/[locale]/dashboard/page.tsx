"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import {
  CreditCard,
  User,
  Zap,
  Settings,
  Copy,
  Check,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { useSupabaseSession } from "~/lib/supabase-auth-client";
import { useTranslations } from "next-intl";
import { useCredits } from "~/lib/hooks/useCredits";
import { CreditTransactions } from "~/components/payment/credit-transactions";
import { CurrentUserAvatar } from "~/components/current-user-avatar";
import { useSubscription } from "~/lib/hooks/use-subscription";
import { useSubscriptionStatus } from "~/lib/hooks/use-subscription-status";

export default function DashboardPage() {
  const { user, loading } = useSupabaseSession();
  const router = useRouter();
  const t = useTranslations("Dashboard");
  const tHistory = useTranslations("History");
  const [copied, setCopied] = useState(false);

  // 使用新的积分系统
  const {
    balance,
    totalRecharged,
    totalConsumed,
    isLoading: creditsLoading,
    error: creditsError,
    refreshCredits,
  } = useCredits();

  const { isActive: hasActiveSubscription, isLoading: subscriptionLoading } =
    useSubscriptionStatus();

  // 刷新积分数据
  useEffect(() => {
    if (user) {
      refreshCredits();
    }
  }, [user, refreshCredits]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-cyan-50 dark:from-gray-900 dark:via-purple-900 dark:to-blue-900">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-purple-500 border-t-transparent mx-auto"></div>
          <p className="text-gray-600 dark:text-gray-300 font-medium">
            {t("loading")}
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    router.push("/auth/sign-in");
    return null;
  }

  const accountId = user?.id || "-";
  const accountEmail = user?.email || "-";
  const showRecharge = balance === 0;

  // 只有有订阅且充值过才显示账单入口，否则显示充值引导
  const canViewBilling = hasActiveSubscription && totalRecharged > 0;
  const isBillingLoading = subscriptionLoading || creditsLoading;

  // 删除 subscriptions 相关逻辑
  // const activeSub = subscriptions.find((sub) => sub.status === "active");
  // const subscriptionEndDate = activeSub?.endDate
  //   ? new Date(activeSub.endDate).toLocaleDateString()
  //   : null;
  const subscriptionEndDate = null; // 暂无订阅到期时间，后续如需展示可扩展 getSubscriptionStatus 返回

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(accountId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy: ", err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-6 sm:px-8 lg:px-12 py-12">
        {/* Header Section - Enhanced */}
        <div className="mb-12 text-center relative">
          <div className="relative">
            <div className="flex justify-center mb-6">
              <div className="relative">
                <CurrentUserAvatar />
              </div>
            </div>
            <h1 className="text-4xl font-bold text-slate-900 mb-3">
              {t("welcomeBack")}
            </h1>
            <p className="text-slate-600 text-lg font-medium">{accountEmail}</p>
            <div className="mt-4 inline-flex items-center px-4 py-2 bg-slate-50 rounded-full border border-slate-200">
              <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
              <span className="text-sm font-medium text-slate-700">
                {t("active")}
              </span>
            </div>
            {hasActiveSubscription && subscriptionEndDate && (
              <div className="mt-2 text-sm text-blue-600 font-semibold">
                订阅到期时间：{subscriptionEndDate}
              </div>
            )}
          </div>
        </div>

        {/* Stats Overview - Enhanced */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Current Credits */}
          <Card className="border border-purple-200 bg-purple-50 text-purple-900 shadow-lg hover:shadow-xl transition-all duration-300">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="p-3 bg-purple-100 rounded-xl">
                  <Zap className="h-6 w-6 text-purple-600" />
                </div>
                <Badge
                  variant="secondary"
                  className="border-0 bg-purple-100 text-purple-700"
                >
                  {balance === 0 ? t("empty") : t("available")}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-center space-y-3">
                <p className="text-purple-700 text-sm font-medium">
                  {t("currentCredits")}
                </p>
                {creditsLoading ? (
                  <div className="animate-pulse flex justify-center">
                    <div className="h-12 bg-purple-200 rounded w-20"></div>
                  </div>
                ) : (
                  <p className="text-5xl font-bold leading-none">{balance}</p>
                )}
                {creditsError && (
                  <p className="text-red-500 text-xs">{t("failedToLoad")}</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Total Recharged */}
          <Card className="border border-blue-200 bg-blue-50 text-blue-900 shadow-lg hover:shadow-xl transition-all duration-300">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="p-3 bg-blue-100 rounded-xl">
                  <TrendingUp className="h-6 w-6 text-blue-600" />
                </div>
                <Badge
                  variant="secondary"
                  className="border-0 bg-blue-100 text-blue-700"
                >
                  {t("total")}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-center space-y-3">
                <p className="text-blue-700 text-sm font-medium">
                  {t("totalRecharged")}
                </p>
                {creditsLoading ? (
                  <div className="animate-pulse flex justify-center">
                    <div className="h-12 bg-blue-200 rounded w-20"></div>
                  </div>
                ) : (
                  <p className="text-5xl font-bold leading-none">
                    {totalRecharged}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Total Consumed */}
          <Card className="border border-emerald-200 bg-emerald-50 text-emerald-900 shadow-lg hover:shadow-xl transition-all duration-300">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="p-3 bg-emerald-100 rounded-xl">
                  <Sparkles className="h-6 w-6 text-emerald-600" />
                </div>
                <Badge
                  variant="secondary"
                  className="border-0 bg-emerald-100 text-emerald-700"
                >
                  {t("used")}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-center space-y-3">
                <p className="text-emerald-700 text-sm font-medium">
                  {t("totalUsed")}
                </p>
                {creditsLoading ? (
                  <div className="animate-pulse flex justify-center">
                    <div className="h-12 bg-emerald-200 rounded w-20"></div>
                  </div>
                ) : (
                  <p className="text-5xl font-bold leading-none">
                    {totalConsumed}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Account Details - Enhanced */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Account ID Card */}
          <Card className="flex flex-col bg-white border border-slate-200 shadow-lg hover:shadow-xl transition-all duration-300">
            <CardHeader className="space-y-0 pb-4">
              <div className="flex items-center space-x-3">
                <div className="p-3 bg-slate-100 rounded-xl text-slate-700">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-lg font-semibold text-slate-900">
                    {t("accountId")}
                  </CardTitle>
                  <p className="text-sm text-slate-500">{t("accountIdDesc")}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-grow flex-col justify-end">
              <div className="flex items-center gap-3">
                <div className="flex h-12 flex-1 items-center rounded-xl border border-slate-200 bg-slate-50 px-4">
                  <p className="text-sm font-mono text-slate-700 break-all">
                    {accountId}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyToClipboard}
                  className="shrink-0 h-12 px-4 bg-white hover:bg-slate-50 border-slate-300"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 mr-2 text-green-600" />
                      <span className="text-green-600">{t("copied")}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-2" />
                      <span>{t("copy")}</span>
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 历史记录卡片 */}
          <Card className="flex flex-col bg-white border border-slate-200 shadow-lg hover:shadow-xl transition-all duration-300">
            <CardHeader>
              <div className="flex items-center space-x-3">
                <div className="p-3 bg-slate-100 rounded-xl text-slate-700">
                  <Settings className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-lg font-semibold text-slate-900">
                    {tHistory("title")}
                  </CardTitle>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-grow flex-col justify-end space-y-3">
              <Button
                variant="outline"
                className="w-full justify-start gap-3 h-12"
                onClick={() => router.push("/dashboard/history")}
              >
                <Settings className="w-4 h-4 text-slate-600" />
                <span className="text-slate-700">{tHistory("title")}</span>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Recharge/Billing Section */}
        <div className="mt-12">
          <Card className="bg-blue-300 border-0 shadow-2xl text-white">
            <CardHeader>
              <div className="flex items-center space-x-3">
                <div className="p-3 bg-blue-500 rounded-xl">
                  <Zap className="h-6 w-6 text-white" />
                </div>
                <div>
                  <CardTitle className="text-xl font-bold">
                    {canViewBilling
                      ? t("billingTitle", {
                          defaultMessage: "Subscription Billing",
                        })
                      : t("rechargeTitle")}
                  </CardTitle>
                  <p className="text-sm text-blue-100">
                    {canViewBilling
                      ? t("billingDesc", {
                          defaultMessage:
                            "View your subscription and billing history.",
                        })
                      : t("rechargeDesc")}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isBillingLoading ? (
                <Button
                  className="w-full bg-white text-blue-600 font-bold text-lg"
                  disabled
                >
                  Loading...
                </Button>
              ) : canViewBilling ? (
                <Button
                  className="w-full bg-white text-blue-600 font-bold text-lg hover:bg-blue-50"
                  onClick={() => router.push("/dashboard/billing")}
                >
                  {t("viewBilling", { defaultMessage: "View Billing" })}
                </Button>
              ) : (
                <Button
                  className="w-full bg-white text-blue-600 font-bold text-lg hover:bg-blue-50"
                  onClick={() => router.push("/pricing")}
                >
                  {t("rechargeNow")}
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Credit Transactions Section */}
        <div className="mt-12">
          <CreditTransactions />
        </div>
      </div>
    </div>
  );
}
