import Stripe from "stripe";

// 延迟初始化 Stripe 客户端
let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (_stripe) {
    return _stripe;
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  
  if (!stripeSecretKey) {
    throw new Error("缺少 Stripe 密钥 - 请配置 STRIPE_SECRET_KEY 环境变量");
  }

  _stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2025-05-28.basil",
    typescript: true,
  });

  return _stripe;
}

// 导出延迟初始化的 stripe 实例
export const stripe = new Proxy({} as Stripe, {
  get(target, prop) {
    const stripeInstance = getStripe();
    return stripeInstance[prop as keyof Stripe];
  }
});

// 价格 ID 映射
export const PRODUCTS = {
  PREMIUM: {
    name: "Premium 计划",
    priceId: process.env.STRIPE_PREMIUM_PRICE_ID || "",
  },
  PRO: {
    name: "Pro 计划",
    priceId: process.env.STRIPE_PRO_PRICE_ID || "",
  },
};
