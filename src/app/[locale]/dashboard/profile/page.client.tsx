"use client";

import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { Button } from "~/components/ui/button";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import {
  useCurrentUserOrRedirect,
  supabaseAuth,
} from "~/lib/supabase-auth-client";
import { useRouter } from "next/navigation";
import { CurrentUserAvatar } from "~/components/current-user-avatar";
import { useSubscriptionStatus } from "~/lib/hooks/use-subscription-status";

// 全局图片数状态（可用context或localStorage实现，这里用localStorage简单演示）
function useImageCount() {
  const [count, setCount] = useState<number>(0);
  useEffect(() => {
    const stored = localStorage.getItem("imageCount");
    setCount(stored ? parseInt(stored, 10) : 5); // 默认5张
  }, []);
  // 提供减少图片数的方法
  const decrement = () => {
    setCount((prev) => {
      const next = Math.max(prev - 1, 0);
      localStorage.setItem("imageCount", next.toString());
      return next;
    });
  };
  // 提供充值方法
  const recharge = (num: number) => {
    setCount(num);
    localStorage.setItem("imageCount", num.toString());
  };
  return { count, decrement, recharge };
}

export default function ProfilePageClient() {
  const t = useTranslations();
  const router = useRouter();
  const { isPending, user } = useCurrentUserOrRedirect();
  const { count, recharge } = useImageCount();
  const accountId = user?.id || "-";
  const accountEmail = user?.email || "-";
  const userName = "q az";
  const { isActive: isSubscribed, isLoading: subscriptionLoading } = useSubscriptionStatus();

  // 续费提醒
  const showRecharge = count === 0;

  // 订阅按钮点击
  const handleSubscribe = () => {
    router.push("/pricing");
  };

  // 登出方法
  const handleLogout = async () => {
    try {
      await supabaseAuth.signOutWithRedirect();
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  // 监听订阅状态（假设/pricing订阅成功后会设置localStorage）
  useEffect(() => {
    const checkSub = () =>
      // setIsSubscribed(localStorage.getItem("isSubscribed") === "true"); // 移除 localStorage 相关 isSubscribed 逻辑
      // 移除 localStorage 相关 isSubscribed 逻辑
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background">
      <div className="flex flex-col items-center">
        <div className="flex flex-col items-center mb-4">
          <CurrentUserAvatar />
          <div className="mt-2 text-foreground text-lg font-bold">
            {userName}
          </div>
        </div>
        <div className="bg-card rounded-2xl p-6 w-[480px] text-foreground mb-8">
          <div className="flex justify-between py-2 border-b border-border">
            <span>
              {t("profile.accountId", { defaultMessage: "Account ID" })}
            </span>
            <span className="text-muted-foreground break-all max-w-[335px] text-right">
              {accountId}
            </span>
          </div>
          <div className="flex justify-between py-2 border-b border-border">
            <span>{t("profile.account", { defaultMessage: "Account" })}</span>
            <span className="text-muted-foreground">{accountEmail}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-border">
            <span>
              {t("profile.remainingImages", {
                defaultMessage: "Remaining Images",
              })}
            </span>
            <span className={count === 0 ? "text-destructive" : "text-primary"}>
              {count}
            </span>
          </div>
          <div className="flex justify-between py-2">
            <span>{t("profile.account", { defaultMessage: "Account" })}</span>
            <Button variant="secondary" size="sm" onClick={handleLogout}>
              {t("profile.logout", { defaultMessage: "Log out" })}
            </Button>
          </div>
        </div>
        {/* 会员卡片 */}
        {!isSubscribed && (
          <div className="bg-card rounded-2xl p-8 w-[480px] flex flex-col items-center">
            <div className="flex flex-col items-center mb-4">
              <div className="mb-2">
                <svg
                  width="40"
                  height="40"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="fill-muted-foreground"
                >
                  <path d="M12 2L15 8L22 9L17 14L18 21L12 18L6 21L7 14L2 9L9 8L12 2Z" />
                </svg>
              </div>
              {showRecharge ? (
                <>
                  <div className="text-destructive text-lg font-bold mb-2">
                    {t("profile.noCreditsLeft", {
                      defaultMessage: "No credits left!",
                    })}
                  </div>
                  <div className="text-muted-foreground text-sm mb-4 text-center">
                    {t("profile.subscribeForCredits", {
                      defaultMessage:
                        "Subscribe to get more credits and enjoy unlimited features",
                    })}
                  </div>
                  <Button
                    className="bg-primary text-primary-foreground w-full text-lg font-bold rounded-xl py-2 hover:bg-primary/90"
                    onClick={handleSubscribe}
                  >
                    {t("profile.subscribe", { defaultMessage: "Subscribe" })}
                  </Button>
                </>
              ) : (
                <>
                  <div className="text-foreground text-lg font-bold mb-2">
                    {t("profile.notMember", {
                      defaultMessage: "You are not a member yet",
                    })}
                  </div>
                  <div className="text-muted-foreground text-sm mb-4 text-center">
                    {t("profile.subscribeTip", {
                      defaultMessage:
                        "Subscribe to access VIP benefits and choose your ideal plan",
                    })}
                  </div>
                  <Button
                    className="bg-primary text-primary-foreground w-full text-lg font-bold rounded-xl py-2 hover:bg-primary/90"
                    onClick={handleSubscribe}
                  >
                    {t("profile.subscribe", { defaultMessage: "Subscribe" })}
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
