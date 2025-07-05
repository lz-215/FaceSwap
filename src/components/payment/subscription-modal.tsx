"use client";

import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSupabaseSession } from "~/lib/supabase-auth-client";

import { PaymentForm } from "~/components/payment/payment-form";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";

// 初始化 Stripe
const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

interface SubscriptionModalProps {
  customerId?: string;
  interval: string;
  onError?: (error: string) => void;
  onSuccess?: (subscriptionId: string) => void;
  planName: string;
  price: string;
  priceId: string;
  triggerText: string;
}

export function SubscriptionModal({
  customerId,
  interval,
  onError,
  onSuccess,
  planName,
  price,
  priceId,
  triggerText,
}: SubscriptionModalProps) {
  const [open, setOpen] = useState(false);
  const [clientSecret, setClientSecret] = useState("");
  const [subscriptionId, setSubscriptionId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const { user } = useSupabaseSession();

  const createSubscription = async () => {
    if (!user) {
      router.push("/auth/sign-in");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/stripe/create-subscription", {
        body: JSON.stringify({
          customerId,
          priceId,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      const data: any = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "创建订阅失败");
      }

      setClientSecret(data.clientSecret);
      setSubscriptionId(data.subscriptionId);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "未知错误";
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (newOpen) {
      createSubscription();
    } else {
      // 关闭时重置状态
      setClientSecret("");
      setSubscriptionId("");
      setError("");
    }
  };

  const handleSuccess = () => {
    setOpen(false);
    onSuccess?.(subscriptionId);
    // 支付/订阅成功后自动刷新页面，确保会员权益立即生效
    window.location.reload();
  };

  const handleError = (errorMessage: string) => {
    setError(errorMessage);
    onError?.(errorMessage);
  };

  const appearance = {
    theme: "stripe" as const,
    variables: {
      borderRadius: "4px",
      colorBackground: "#f7f7ff",
      colorDanger: "#df1b41",
      colorPrimary: "#5a5aff",
      colorText: "#1a1a1c",
      fontFamily: "Ideal Sans, system-ui, sans-serif",
      spacingUnit: "2px",
    },
  };

  const options = {
    appearance,
    clientSecret,
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger asChild>
        <Button>{triggerText}</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>订阅 {planName}</DialogTitle>
          <DialogDescription>
            {price}/{interval} - 立即开始订阅
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 订阅详情 */}
          <div className="rounded-lg border bg-muted/50 p-4">
            <h4 className="mb-2 font-medium">{planName}</h4>
            <div className="space-y-1 text-sm text-muted-foreground">
              <div>
                价格: {price}/{interval}
              </div>
              <div className="space-y-2 text-sm text-muted-foreground">
                <div>订阅将自动续费</div>
                <div>可随时取消</div>
              </div>
            </div>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="flex items-center gap-2">
                <div
                  className={`
                                  h-4 w-4 animate-spin rounded-full border-2
                                  border-current border-t-transparent
                                `}
                />
                正在创建订阅...
              </div>
            </div>
          )}
          {error && (
            <div
              className={`
                          rounded-md bg-destructive/10 p-3 text-sm
                          text-destructive
                        `}
            >
              {error}
            </div>
          )}

          {clientSecret && !loading && (
            <Elements options={options} stripe={stripePromise}>
              <PaymentForm
                amount={Number.parseFloat(price.replace("$", ""))}
                onError={handleError}
                onSuccess={handleSuccess}
              />
            </Elements>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
