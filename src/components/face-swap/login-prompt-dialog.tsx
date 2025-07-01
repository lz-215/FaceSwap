"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Check, User, History, Star, Zap } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";

interface LoginPromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LoginPromptDialog({
  open,
  onOpenChange,
}: LoginPromptDialogProps) {
  const t = useTranslations("FaceSwap.loginPrompt");
  const router = useRouter();

  const benefits = [
    {
      icon: User,
      text: t("benefits.0", { defaultMessage: "Unlimited AI face swapping" }),
    },
    {
      icon: History,
      text: t("benefits.1", { defaultMessage: "Save and manage swap history" }),
    },
    {
      icon: Star,
      text: t("benefits.2", {
        defaultMessage: "High-quality watermark-free results",
      }),
    },
    {
      icon: Zap,
      text: t("benefits.3", { defaultMessage: "Priority processing speed" }),
    },
  ];

  const handleLogin = () => {
    onOpenChange(false);
    router.push("/auth/sign-in");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center text-xl font-bold">
            {t("title", { defaultMessage: "Login Required for Face Swap" })}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* 描述 */}
          <p className="text-center text-muted-foreground">
            {t("description", {
              defaultMessage:
                "Sign in to enjoy AI face swapping services, save your history, and manage your creations.",
            })}
          </p>

          {/* 权益列表 */}
          <Card>
            <CardContent className="p-4">
              <div className="space-y-3">
                {benefits.map((benefit, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                      <benefit.icon className="h-4 w-4 text-primary" />
                    </div>
                    <span className="text-sm">{benefit.text}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 操作按钮 */}
          <div className="space-y-3">
            <Button className="w-full" size="lg" onClick={handleLogin}>
              {t("loginButton", { defaultMessage: "Sign In Now" })}
            </Button>

            <Button
              variant="ghost"
              className="w-full"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              {t("cancelButton", { defaultMessage: "Maybe Later" })}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
