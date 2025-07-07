"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Zap, Calendar, Star } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { useToast } from "~/hooks/use-toast";
import { useSupabaseSession } from "~/lib/supabase-auth-client";
import { STRIPE_CONFIG, type StripeInterval } from "~/lib/stripe-config";

interface SubscriptionCardsProps {
  locale?: string;
}

interface CheckoutResponse {
  url?: string;
  sessionId?: string;
  customerId?: string;
  error?: string;
}

// 将配置转换为数组格式以便于渲染
const PLANS = Object.values(STRIPE_CONFIG.PLANS);

export function SubscriptionCards({ locale = "en" }: SubscriptionCardsProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const { user } = useSupabaseSession();
  const router = useRouter();
  const { toast } = useToast();

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-US", {
      style: "currency",
      currency: "USD",
    }).format(price);
  };

  const handleSubscribe = async (
    planId: string,
    priceId: string,
    interval: StripeInterval
  ) => {
    if (!user) {
      router.push("/auth/sign-in");
      return;
    }

    setLoadingId(planId);

    try {
      // 调用checkout API创建支付会话
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          priceId,
          interval,
        }),
      });

      const data = (await response.json()) as CheckoutResponse;

      if (!response.ok) {
        throw new Error(data.error || "创建支付会话失败");
      }

      if (data.url) {
        // 跳转到Stripe Checkout页面
        window.location.href = data.url;
      } else {
        throw new Error("未收到支付链接");
      }
    } catch (error) {
      console.error("订阅失败:", error);
      toast({
        title: locale === "zh" ? "订阅失败" : "Subscription Failed",
        description:
          locale === "zh"
            ? "创建支付会话失败，请稍后重试"
            : "Failed to create payment session, please try again",
        variant: "destructive",
      });
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {PLANS.map((plan) => (
          <Card
            key={plan.id}
            className={`relative transition-all duration-200 hover:shadow-md ${
              plan.highlight
                ? "border-primary shadow-md scale-100 border-2"
                : "border-border hover:border-primary/50"
            } rounded-lg p-4`}
          >
            {plan.highlight && (
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 z-10">
                <Badge className="bg-yellow-400 text-yellow-900 px-3 py-0.5 flex items-center gap-1 text-xs">
                  <Star className="w-3 h-3" />
                  {plan.badge
                    ? plan.badge[locale as "zh" | "en"] ?? plan.badge.en
                    : null}
                </Badge>
              </div>
            )}
            <CardHeader className="text-center pb-3 pt-4">
              <div className="flex items-center justify-center mb-2">
                <div className="p-2 bg-primary/10 rounded-lg text-primary">
                  <Zap className="w-6 h-6" />
                </div>
              </div>
              <CardTitle className="text-2xl font-bold mb-1">
                {locale === "zh" ? "订阅服务" : "Subscription Plan"}
              </CardTitle>
              <CardDescription className="text-sm mt-1 mb-1">
                {locale === "zh"
                  ? "订阅解锁所有功能"
                  : "Subscribe to unlock all features"}
              </CardDescription>
              <div className="mt-2">
                <div className="flex items-baseline justify-center">
                  <span className="text-4xl font-bold text-foreground">
                    {formatPrice(plan.price)}
                  </span>
                  <span className="text-muted-foreground ml-1 text-base">
                    {plan.priceSuffix[locale as "zh" | "en"] ??
                      plan.priceSuffix.en}
                  </span>
                </div>
                {plan.id === "yearly" && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {locale === "zh"
                      ? `相当于每月 ${formatPrice(plan.price / 12)}`
                      : `Equivalent to ${formatPrice(plan.price / 12)}/month`}
                  </p>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {/* 积分数量高亮显示 */}
              <div className="bg-primary/5 rounded-md p-3 border border-primary/20 mb-1">
                <div className="flex items-center justify-center">
                  <span className="text-2xl font-bold text-primary mr-1">
                    {plan.credits.toLocaleString()}
                  </span>
                  <span className="text-base text-muted-foreground">
                    {locale === "zh" ? "积分" : "Credits"}
                  </span>
                </div>
                <p className="text-center text-xs text-muted-foreground mt-0.5">
                  {locale === "zh"
                    ? `${plan.id === "yearly" ? "年" : "月"}订阅包含积分`
                    : `Included in ${
                        plan.id === "yearly" ? "yearly" : "monthly"
                      } subscription`}
                </p>
              </div>
              {/* 功能列表 */}
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-primary flex-shrink-0" />
                  <span className="text-xs">
                    {locale === "zh"
                      ? "高质量换脸处理"
                      : "High-quality face swap processing"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-primary flex-shrink-0" />
                  <span className="text-xs">
                    {locale === "zh"
                      ? "优先处理队列"
                      : "Priority processing queue"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-primary flex-shrink-0" />
                  <span className="text-xs">
                    {locale === "zh" ? "无水印输出" : "Watermark-free output"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-primary flex-shrink-0" />
                  <span className="text-xs">
                    {locale === "zh"
                      ? "24/7 客户支持"
                      : "24/7 customer support"}
                  </span>
                </div>
                {plan.id === "yearly" && (
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-primary flex-shrink-0" />
                    <span className="text-xs font-medium text-primary">
                      {locale === "zh"
                        ? "年付独享：额外积分奖励"
                        : "Yearly exclusive: Extra credit bonus"}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
            <CardFooter className="pt-3">
              <Button
                onClick={() =>
                  handleSubscribe(plan.id, plan.priceId, plan.interval)
                }
                disabled={loadingId === plan.id}
                className="w-full bg-primary hover:bg-primary/90 text-white py-2 text-sm"
                size="lg"
              >
                {loadingId === plan.id ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {locale === "zh" ? "跳转中..." : "Redirecting..."}
                  </>
                ) : !user ? (
                  <>{locale === "zh" ? "请先登录" : "Sign in to subscribe"}</>
                ) : (
                  <>
                    {locale === "zh"
                      ? `立即订阅 - 获得 ${plan.credits} 积分`
                      : `Subscribe Now - Get ${plan.credits} Credits`}
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
      {/* 附加说明 */}
      <div className="mt-6 text-center text-xs text-muted-foreground">
        <p>
          {locale === "zh"
            ? "订阅自动续费，随时可在账户设置中取消。积分在订阅期结束时过期。"
            : "Auto-renewable subscription. Cancel anytime in account settings. Credits expire when subscription ends."}
        </p>
      </div>
    </div>
  );
}
