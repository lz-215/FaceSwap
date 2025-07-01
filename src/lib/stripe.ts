import Stripe from "stripe";

// 初始化 Stripe 客户端
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  throw new Error("缺少 Stripe 密钥");
}

export const stripe = new Stripe(stripeSecretKey, {
  apiVersion: "2025-05-28.basil", // 最新版本
  typescript: true,
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
