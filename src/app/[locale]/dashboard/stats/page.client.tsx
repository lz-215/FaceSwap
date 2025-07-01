"use client";

import type { User } from "@supabase/supabase-js";

import Link from "next/link";
import React, { useEffect, useState } from "react";

import { supabaseAuth, useSupabaseSession } from "~/lib/supabase-auth-client";
import { twoFactor } from "~/lib/supabase-mfa";
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

interface DashboardPageClientProps {
  user?: null | User;
}

export function DashboardPageClient({ user }: DashboardPageClientProps) {
  const { loading: isPending } = useSupabaseSession();
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [loadingMfa, setLoadingMfa] = useState(true);

  useEffect(() => {
    const getMfaStatus = async () => {
      try {
        setLoadingMfa(true);
        const { data, error } = await twoFactor.getStatus();
        if (error) {
          console.error("获取 MFA 状态失败:", error);
          return;
        }
        setMfaEnabled(data?.enabled || false);
      } catch (error) {
        console.error("获取 MFA 状态失败:", error);
      } finally {
        setLoadingMfa(false);
      }
    };

    getMfaStatus();
  }, []);

  const handleSignOut = async () => {
    try {
      await supabaseAuth.signOutWithRedirect();
    } catch (error) {
      console.error("Sign out error:", error);
    }
  };

  // If we're still loading, show a skeleton
  if (isPending) {
    return (
      <div
        className={`
          container grid flex-1 items-start gap-4 p-4
          md:grid-cols-2 md:gap-8
          lg:grid-cols-3
        `}
      >
        <div
          className={`
            grid gap-4
            md:col-span-2
            lg:col-span-1
          `}
        >
          <Card>
            <CardHeader className="space-y-2">
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-4 w-1/2" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-20 w-full" />
            </CardContent>
            <CardFooter>
              <Skeleton className="h-10 w-28" />
            </CardFooter>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`
        container grid flex-1 items-start gap-4 p-4
        md:grid-cols-2 md:gap-8
        lg:grid-cols-3
      `}
    >
      <div
        className={`
          grid gap-4
          md:col-span-2
          lg:col-span-1
        `}
      >
        <Card>
          <CardHeader>
            <CardTitle>Welcome to your Dashboard</CardTitle>
            <CardDescription>
              Manage your account and view your information
            </CardDescription>
          </CardHeader>
          <CardContent>
            {user && (
              <div className="space-y-2">
                <div className="space-y-1">
                  <p className="text-sm leading-none font-medium">Name</p>
                  <p className="text-sm text-muted-foreground">
                    {user.email ?? "Not set"}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm leading-none font-medium">Email</p>
                  <p className="text-sm text-muted-foreground">
                    {user.email ?? "Not set"}
                  </p>
                </div>
                {/* {user?.firstName && (
                  <div className="space-y-1">
                    <p className="text-sm leading-none font-medium">
                      First Name
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {user.firstName}
                    </p>
                  </div>
                )}
                {user?.lastName && (
                  <div className="space-y-1">
                    <p className="text-sm leading-none font-medium">
                      Last Name
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {user.lastName}
                    </p>
                  </div>
                )}
                {user?.age ? (
                  <div className="space-y-1">
                    <p className="text-sm leading-none font-medium">Age</p>
                    <p className="text-sm text-muted-foreground">{user.age}</p>
                  </div>
                ) : null} */}
                <div className="space-y-1">
                  <p className="text-sm leading-none font-medium">
                    Two-Factor Authentication
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {loadingMfa
                      ? "Loading..."
                      : mfaEnabled
                      ? "Enabled"
                      : "Disabled"}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex justify-between">
            <Link
              className={`
                inline-flex items-center justify-center rounded-md bg-primary
                px-4 py-2 text-sm font-medium text-primary-foreground
                ring-offset-background transition-colors
                hover:bg-primary/90
                focus-visible:ring-2 focus-visible:ring-ring
                focus-visible:ring-offset-2 focus-visible:outline-none
                disabled:pointer-events-none disabled:opacity-50
              `}
              href="/dashboard/profile"
            >
              Edit Profile
            </Link>
            <Button onClick={handleSignOut} variant="destructive">
              Sign Out
            </Button>
          </CardFooter>
        </Card>
      </div>
      <div
        className={`
          grid gap-4
          md:col-span-2
          lg:col-span-2
        `}
      >
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>
              Common actions you might want to perform
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6">
            <div className="grid grid-cols-2 gap-4">
              <Link
                className={`
                  inline-flex items-center justify-center rounded-md bg-primary
                  px-4 py-2 text-sm font-medium text-primary-foreground
                  ring-offset-background transition-colors
                  hover:bg-primary/90
                  focus-visible:ring-2 focus-visible:ring-ring
                  focus-visible:ring-offset-2 focus-visible:outline-none
                  disabled:pointer-events-none disabled:opacity-50
                `}
                href="/dashboard/profile"
              >
                Edit Profile
              </Link>
              <Button onClick={handleSignOut} variant="outline">
                Sign Out
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
