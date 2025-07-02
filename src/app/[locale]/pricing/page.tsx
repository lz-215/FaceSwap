"use client";

import { useTranslations, useLocale } from "next-intl";
import { Coins, Zap } from "lucide-react";
import { SubscriptionCards } from "~/components/pricing/subscription-cards";

export default function PricingPage() {
  const tPage = useTranslations("PricingPage");
  const locale = useLocale();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background py-12 px-4">
      <div className="text-center mb-12">
        <h1 className="mb-4 text-4xl font-bold text-foreground">
          {tPage("choosePlan")}
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          {tPage("subtitle")}
        </p>
      </div>

      {/* 订阅卡片 */}
      <SubscriptionCards locale={locale} />

      {/* 附加信息 */}
      <div className="mt-12 max-w-3xl mx-auto text-center">
        <div className="grid md:grid-cols-3 gap-6 text-sm text-muted-foreground">
          <div className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
              <Zap className="w-6 h-6 text-primary" />
            </div>
            <h4 className="font-medium text-foreground">
              {locale === "zh" ? "即时激活" : "Instant Activation"}
            </h4>
            <p className="text-center">
              {locale === "zh"
                ? "支付成功后立即开始使用所有功能"
                : "Start using all features immediately after payment"}
            </p>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
              <Coins className="w-6 h-6 text-primary" />
            </div>
            <h4 className="font-medium text-foreground">
              {locale === "zh" ? "灵活计费" : "Flexible Billing"}
            </h4>
            <p className="text-center">
              {locale === "zh"
                ? "随时升级、降级或取消订阅"
                : "Upgrade, downgrade, or cancel anytime"}
            </p>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
              <svg
                className="w-6 h-6 text-primary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
            </div>
            <h4 className="font-medium text-foreground">
              {locale === "zh" ? "安全支付" : "Secure Payment"}
            </h4>
            <p className="text-center">
              {locale === "zh"
                ? "使用Stripe安全支付，支持所有主流信用卡"
                : "Secure payments via Stripe, supporting all major credit cards"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
