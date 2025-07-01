"use client";

import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Check, Flame, Info, Zap, Coins, X, Plus } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useState } from "react";

const creditPackages = [
  { credits: 400, price: 4.99, rate: 80, label: null, highlight: false },
  { credits: 1000, price: 8.99, rate: 110, label: "30% OFF", highlight: true },
  {
    credits: 5000,
    price: 39.99,
    rate: 125,
    label: "40% OFF",
    highlight: false,
  },
  {
    credits: 30000,
    price: 199.99,
    rate: 150,
    label: "50% OFF",
    highlight: false,
  },
];

const vidmageFeatures = [
  { text: "Lower Cost", desc: "From $0.0063 per second", strong: true },
  {
    text: "No Watermark",
    desc: "Always watermark-free, even in free trial",
    strong: true,
  },
  {
    text: "Superior Facial Clarity",
    desc: "Clearer, more detailed facial features",
    strong: true,
  },
  {
    text: "Original Resolution Preserved",
    desc: "No quality loss from your source media",
    strong: true,
  },
  {
    text: "No-Registration Free Trial",
    desc: "Start using immediately without signup",
    strong: true,
  },
  {
    text: "Web+Mac Unified Account",
    desc: "One account for Web & Mac versions",
    strong: true,
  },
  { divider: true },
  { group: "Mac Version" },
  {
    text: "Local Processing",
    desc: "100% local with complete privacy",
    strong: true,
  },
  { text: "Real-time Preview", desc: "Face swap as video plays" },
  { text: "Facial Feature Swap", desc: "Partial face replacement options" },
  {
    text: "Live Face Swap",
    desc: "Face swap for video calls and live streaming",
  },
  {
    text: "Multi-Format Video Support",
    desc: "Compatible with all major video formats",
  },
  { text: "No Limits", desc: "No file size or resolution restrictions" },
];

const otherToolFeatures = [
  { text: "Higher Cost", desc: "$0.01 - $0.05 per second", strong: true },
  {
    text: "Has Watermark",
    desc: "Free trial outputs contain visible watermarks",
    strong: true,
  },
  {
    text: "Poor Facial Clarity",
    desc: "Blurry, less defined facial details",
    strong: true,
  },
  {
    text: "Reduced Output Resolution",
    desc: "Lower quality than original media",
    strong: true,
  },
  {
    text: "Registration-Required Trial",
    desc: "Signup needed before trying",
    strong: true,
  },
  {
    text: "Single-Platform Only",
    desc: "Supports only one platform (Web or Mac)",
    strong: true,
  },
  { divider: true },
  { group: "Mac Version" },
  { text: "Cloud Processing", desc: "Requires uploading to servers" },
  { text: "Slow Processing", desc: "Long wait times, no live preview" },
  { text: "Full Face Only", desc: "No partial face replacement options" },
  { text: "No Live Support", desc: "Can not use for video calls or streaming" },
  {
    text: "Limited Video Format Support",
    desc: "Only works with specific video types",
  },
  { text: "Strict Limits", desc: "File size and duration restrictions" },
];

const faqs = [
  "What is VidMage?",
  "What file formats does VidMage support?",
  "Is VidMage free to use?",
  "How does VidMage ensure privacy and security?",
  "How does VidMage for Mac compare to web-based face-swapping tools?",
  "What are the benefits of using VidMage on Mac?",
  "Does VidMage support multiple face swaps in a single image?",
  "Is there a limit to video length or file size in VidMage?",
  "Does VidMage support high-resolution exports like 4K?",
  "How does VidMage ensure accuracy and detail in face-swapping?",
  "Can VidMage handle low-quality or challenging videos?",
  "How can I achieve the best face-swapping effect with VidMage?",
  "Does VidMage add watermarks to face-swapped images or videos?",
];

export default function PricingPage() {
  const t = useTranslations("Payment");
  const tPage = useTranslations("PricingPage");
  const monthlyFeatures = t.raw("monthlyPlanFeatures") as string[];
  const yearlyFeatures = t.raw("yearlyPlanFeatures") as string[];
  const plans = [
    {
      name: t("monthly", { defaultMessage: "Monthly Plan" }),
      price: "$16.90",
      oldPrice: undefined,
      description: t("monthlyPlanDesc"),
      features: monthlyFeatures,
      action: {
        label: t("subscribe", { defaultMessage: "Subscribe" }),
        variant: "default" as const,
      },
      badge: undefined,
    },
    {
      name: t("yearly", { defaultMessage: "Yearly Plan" }),
      price: "$9.90",
      oldPrice: "$16.90",
      description: t("yearlyPlanDesc"),
      features: yearlyFeatures,
      action: {
        label: t("subscribe", { defaultMessage: "Subscribe" }),
        variant: "default" as const,
      },
      badge: "SAVE 42%",
      promo: undefined,
      promoDesc: undefined,
    },
  ];

  const [selectedPlan, setSelectedPlan] = useState<number | null>(null);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background py-12 px-4">
      <h1 className="mb-2 text-4xl font-bold text-foreground text-center">
        {tPage("choosePlan")}
      </h1>
      <p className="mb-10 text-lg text-muted-foreground text-center max-w-2xl">
        {tPage("subtitle")}
      </p>
      <div className="flex flex-col lg:flex-row gap-8 w-full max-w-7xl justify-center items-stretch">
        {plans.map((plan, idx) => {
          const isSelected = selectedPlan === idx;
          return (
            <Card
              key={plan.name}
              onClick={() => setSelectedPlan(idx)}
              className={`flex-1 max-w-md mx-auto border-2 cursor-pointer transition-all duration-200
                ${
                  isSelected
                    ? "border-primary shadow-[0_0_24px_2px_var(--primary)]"
                    : "border-border"
                }
                bg-card text-foreground relative`}
            >
              {plan.badge && isSelected && (
                <Badge className="absolute left-4 top-4 z-10 bg-primary text-primary-foreground">
                  {plan.badge}
                </Badge>
              )}
              {plan.badge && isSelected && (
                <div className="absolute right-4 top-4 z-10 bg-primary text-primary-foreground px-3 py-1 rounded-full font-bold text-xs">
                  {plan.badge}
                </div>
              )}
              <CardHeader className="items-center text-center">
                <CardTitle className="text-3xl font-bold mb-2 bg-primary rounded-full text-primary-foreground px-4 py-2">
                  {plan.name}
                </CardTitle>
                <div className="flex items-end gap-2 mb-2">
                  <span className="text-4xl font-extrabold">{plan.price}</span>
                  {plan.oldPrice && (
                    <span className="line-through text-muted-foreground text-lg">
                      {plan.oldPrice}
                    </span>
                  )}
                  <span className="text-base text-muted-foreground">
                    /month
                  </span>
                </div>
              </CardHeader>
              <CardContent className="px-6">
                <ul className="space-y-2">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <Check className="text-primary w-4 h-4" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter className="flex flex-col items-center mt-4">
                <Button
                  className={`w-full py-2 text-lg font-bold ${
                    isSelected
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : ""
                  }`}
                  variant={plan.action.variant}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (idx === 0) {
                      // Monthly Plan (第一个计划)
                      window.open(
                        "https://buy.stripe.com/4gM4gB7Jy7ak5DWfYm43S00",
                        "_blank"
                      );
                    } else if (idx === 1) {
                      // Yearly Plan (第二个计划)
                      window.open(
                        "https://buy.stripe.com/eVq4gBfc02U4d6oh2q43S01",
                        "_blank"
                      );
                    }
                  }}
                >
                  {isSelected
                    ? t("tryNow", { defaultMessage: "Try now" })
                    : plan.action.label}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
