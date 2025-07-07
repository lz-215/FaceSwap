// Stripe 配置文件 - 用于管理所有Stripe相关的配置

// 从环境变量获取价格ID，如果没有则使用默认值
export const STRIPE_CONFIG = {
  // 前端可访问的价格ID (需要 NEXT_PUBLIC_ 前缀)
  MONTHLY_PRICE_ID: process.env.NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID || "price_monthly_120_credits",
  YEARLY_PRICE_ID: process.env.NEXT_PUBLIC_STRIPE_YEARLY_PRICE_ID || "price_yearly_1800_credits",
  
  // 公开密钥
  PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "",
  
  // 支付计划配置
  PLANS: {
    MONTHLY: {
      id: "monthly",
      priceId: process.env.NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID || "price_monthly_120_credits",
      price: 16.9,
      credits: 120,
      interval: "month" as const,
      label: {
        zh: "月付",
        en: "Monthly",
      },
      priceSuffix: { zh: "/月", en: "/month" },
      highlight: false,
      badge: null as { zh: string; en: string } | null,
    },
    YEARLY: {
      id: "yearly", 
      priceId: process.env.NEXT_PUBLIC_STRIPE_YEARLY_PRICE_ID || "price_yearly_1800_credits",
      price: 118.8,
      credits: 1800,
      interval: "year" as const,
      label: {
        zh: "年付", 
        en: "Yearly",
      },
      priceSuffix: { zh: "/年", en: "/year" },
      highlight: true,
      badge: {
        zh: "最划算",
        en: "Best Value",
      } as { zh: string; en: string } | null,
    },
  },
} as const;

// 导出类型
export type StripePlan = typeof STRIPE_CONFIG.PLANS[keyof typeof STRIPE_CONFIG.PLANS];
export type StripeInterval = "month" | "year"; 