"use client";

import type { User } from "@supabase/supabase-js";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { PolarSubscription } from "~/lib/database-types";

import { PaymentForm } from "~/components/payments/PaymentForm";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";

interface BillingPageClientProps {
  user: null | User;
}

interface CustomerStateResponse {
  [key: string]: any;
  email: string;
  id: string;
  subscriptions: any[];
}

interface SubscriptionsResponse {
  subscriptions: PolarSubscription[];
}

export function BillingPageClient({ user }: BillingPageClientProps) {
  const router = useRouter();
  const [subscriptions, setSubscriptions] = useState<PolarSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<null | string>(null);
  // 移除未使用的customerState状态，因为它在组件中没有被使用
  const [, setCustomerState] = useState<CustomerStateResponse | null>(null);

  useEffect(() => {
    if (!user) {
      router.push("/auth/sign-in");
      return;
    }

    const fetchSubscriptions = async () => {
      try {
        const response = await fetch("/api/payments/subscriptions");
        if (!response.ok) {
          throw new Error("Failed to fetch subscriptions");
        }
        const data = (await response.json()) as SubscriptionsResponse;
        setSubscriptions(data.subscriptions || []);
      } catch (err) {
        console.error("Error fetching subscriptions:", err);
        setError("Failed to load subscription data. Please try again.");
      }
    };

    const fetchCustomerState = async () => {
      try {
        const response = await fetch("/api/payments/customer-state");
        if (response.ok) {
          const data = (await response.json()) as CustomerStateResponse;
          setCustomerState(data);
        }
      } catch (err) {
        console.error("Error fetching customer state:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchSubscriptions();
    fetchCustomerState();
  }, [user, router]);

  const hasActiveSubscription = subscriptions.some(
    (sub) => sub.status === "active"
  );

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const checkoutSuccess = urlParams.get("checkout_success");

    if (checkoutSuccess === "true") {
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);

      router.refresh();
    }
  }, [router]);

  if (loading) {
    return (
      <div className="container mx-auto py-10">
        <h1 className="mb-6 text-3xl font-bold">Billing</h1>
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-4 w-2/3" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-20 w-full" />
          </CardContent>
          <CardFooter>
            <Skeleton className="h-10 w-full" />
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10">
      <h1 className="mb-6 text-3xl font-bold">Billing</h1>

      {error && (
        <Alert className="mb-6" variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Subscription Status */}
      <div className="mb-8 grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Subscription Status</CardTitle>
            <CardDescription>
              Your current subscription plan and status
            </CardDescription>
          </CardHeader>
          <CardContent>
            {subscriptions.length > 0 ? (
              <div className="space-y-4">
                {subscriptions.map((subscription) => (
                  <div
                    className="flex flex-col md:flex-row md:items-center md:justify-between rounded-lg border p-4 gap-2"
                    key={subscription.id}
                  >
                    <div>
                      <h3 className="font-medium">{subscription.productId}</h3>
                      <p className="text-sm text-muted-foreground">
                        ID: {subscription.subscriptionId}
                      </p>
                      {/*
                      {subscription.startDate && (
                        <p className="text-xs text-muted-foreground">
                          Start: {subscription.startDate}
                        </p>
                      )}
                      {subscription.endDate && (
                        <p className="text-xs text-muted-foreground">
                          End: {subscription.endDate}
                        </p>
                      )}
                      {subscription.amount && (
                        <p className="text-xs text-muted-foreground">
                          Amount: ${(subscription.amount / 100 || 0).toFixed(2)}
                        </p>
                      )}
                      */}
                    </div>
                    <Badge
                      variant={
                        subscription.status === "active" ? "default" : "outline"
                      }
                    >
                      {subscription.status}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">
                You don't have any subscriptions yet.
              </p>
            )}
          </CardContent>
          <CardFooter>
            {hasActiveSubscription && (
              <Button
                onClick={() => router.push("/auth/customer-portal")}
                variant="outline"
              >
                Manage Subscription
              </Button>
            )}
          </CardFooter>
        </Card>
      </div>

      {/* Payment Plans */}
      {/* 不再显示套餐卡片 */}
    </div>
  );
}
