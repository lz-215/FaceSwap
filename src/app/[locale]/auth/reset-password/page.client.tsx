"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLocale } from "next-intl";

import { SEO_CONFIG } from "~/app";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

export function ResetPasswordClient() {
  const router = useRouter();
  const locale = useLocale() as "en" | "zh";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (password !== confirmPassword) {
      setError("密码不匹配");
      setLoading(false);
      return;
    }

    try {
      // 由于我们现在只使用第三方登录，这个功能暂时禁用
      setError("密码重置功能已禁用，请使用第三方登录");
    } catch (err) {
      setError("重置密码时出错");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`
        grid h-screen w-screen
        md:grid-cols-2
      `}
    >
      {/* Left side - Image */}
      <div
        className={`
          relative hidden
          md:block
        `}
      >
        <Image
          alt="Reset password background image"
          className="object-cover"
          fill
          priority
          sizes="(max-width: 768px) 0vw, 50vw"
          src="https://images.unsplash.com/photo-1719811059181-09032aef07b8?q=80&w=1200&auto=format&fit=crop&ixlib=rb-4.0.3"
        />
        <div
          className={`
            absolute inset-0 bg-gradient-to-t from-background/80 to-transparent
          `}
        />
        <div className="absolute bottom-8 left-8 z-10 text-white">
          <h1 className="text-3xl font-bold">{SEO_CONFIG.name[locale]}</h1>
          <p className="mt-2 max-w-md text-sm text-white/80">
            {SEO_CONFIG.slogan[locale]}
          </p>
        </div>
      </div>
      {/* Right side - Reset password form */}
      <div
        className={`
          flex items-center justify-center p-4
          md:p-8
        `}
      >
        <div className="w-full max-w-md space-y-4">
          <div
            className={`
              space-y-4 text-center
              md:text-left
            `}
          >
            <h2 className="text-3xl font-bold">密码重置已禁用</h2>
            <p className="text-sm text-muted-foreground">
              请使用第三方账户登录
            </p>
          </div>

          <Card className="border-none shadow-sm">
            <CardContent className="pt-4">
              <div className="space-y-4">
                <div className="rounded-lg bg-orange-50 p-4 text-orange-800">
                  <p>密码重置功能已禁用</p>
                  <p className="mt-2 text-sm">
                    我们现在只支持第三方账户登录（GitHub 和 Google）
                  </p>
                </div>
                <div className="text-center">
                  <Link
                    className={`
                      inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground
                      hover:bg-primary/90
                    `}
                    href="/auth/sign-in"
                  >
                    前往登录页面
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
