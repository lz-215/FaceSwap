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

      {/* 美化后的交易记录和到期时间展示 */}
      <div className="mb-8">
        <Card>
          <CardHeader>
            <CardTitle>Subscription Transactions</CardTitle>
            <CardDescription>
              All your subscription periods, expiry dates, and credits
            </CardDescription>
          </CardHeader>
          <CardContent>
            {subscriptions.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        ID
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Expiry
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {subscriptions.map((subscription) => {
                      const isExpiringSoon =
                        subscription.endDate &&
                        new Date(subscription.endDate).getTime() - Date.now() <
                          7 * 24 * 60 * 60 * 1000 &&
                        subscription.status === "active";
                      let badgeColor = "";
                      if (subscription.status === "active")
                        badgeColor = isExpiringSoon
                          ? "bg-yellow-400 text-yellow-900"
                          : "bg-green-500 text-white";
                      else if (subscription.status === "expired")
                        badgeColor = "bg-gray-400 text-white";
                      else if (subscription.status === "cancelled")
                        badgeColor = "bg-red-500 text-white";
                      else badgeColor = "bg-blue-400 text-white";
                      return (
                        <tr
                          key={subscription.subscriptionId}
                          className={isExpiringSoon ? "bg-yellow-50" : ""}
                        >
                          <td className="px-4 py-2 font-mono text-xs text-gray-700">
                            {subscription.subscriptionId}
                          </td>
                          <td className="px-4 py-2 text-sm">
                            {subscription.endDate ? (
                              <span
                                className={
                                  isExpiringSoon
                                    ? "font-bold text-yellow-700"
                                    : ""
                                }
                              >
                                {new Date(
                                  subscription.endDate
                                ).toLocaleString()}
                                {isExpiringSoon && (
                                  <span className="ml-2 text-xs bg-yellow-200 px-2 py-0.5 rounded">
                                    Expiring Soon
                                  </span>
                                )}
                              </span>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className="px-4 py-2">
                            <span
                              className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${badgeColor}`}
                            >
                              {subscription.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12">
                <svg
                  width="64"
                  height="64"
                  fill="none"
                  viewBox="0 0 24 24"
                  className="mb-4 text-gray-300"
                >
                  <path
                    d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10Zm-2-7h4m-2-6v6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <p className="text-muted-foreground text-lg">
                  No subscription transactions found.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
