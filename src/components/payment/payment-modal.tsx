"use client";

import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useState } from "react";

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

// Initialize Stripe
const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

interface PaymentModalProps {
  amount: number;
  description: string;
  onError?: (error: string) => void;
  onSuccess?: () => void;
  triggerText: string;
}

export function PaymentModal({
  amount,
  description,
  onError,
  onSuccess,
  triggerText,
}: PaymentModalProps) {
  const [open, setOpen] = useState(false);
  const [clientSecret, setClientSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const createPaymentIntent = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/stripe/create-payment-intent", {
        body: JSON.stringify({
          amount: Math.round(amount * 100), // Stripe expects amount in cents
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      const data: any = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "创建支付意图失败");
      }

      setClientSecret(data.clientSecret);
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
      createPaymentIntent();
    } else {
      // Reset state on close
      setClientSecret("");
      setError("");
    }
  };

  const handleSuccess = () => {
    setOpen(false);
    onSuccess?.();
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
          <DialogTitle>一次性支付</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="flex items-center gap-2">
                <div
                  className={`
                                  h-4 w-4 animate-spin rounded-full border-2
                                  border-current border-t-transparent
                                `}
                />
                正在准备支付...
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
                amount={amount}
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
