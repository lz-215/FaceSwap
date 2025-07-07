import { NextResponse } from "next/server";
import { stripe } from "~/lib/stripe";

export async function GET() {
  try {
    // 检查必要的环境变量
    const config = {
      hasStripeSecretKey: !!process.env.STRIPE_SECRET_KEY,
      hasPublishableKey: !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
      hasMonthlyPriceId: !!process.env.NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID,
      hasYearlyPriceId: !!process.env.NEXT_PUBLIC_STRIPE_YEARLY_PRICE_ID,
      hasAppUrl: !!process.env.NEXT_PUBLIC_APP_URL,
      monthlyPriceId: process.env.NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID || "未设置",
      yearlyPriceId: process.env.NEXT_PUBLIC_STRIPE_YEARLY_PRICE_ID || "未设置",
      appUrl: process.env.NEXT_PUBLIC_APP_URL || "未设置",
    };

    // 测试Stripe连接
    let stripeConnectionStatus = "未知";
    try {
      // 尝试调用Stripe API来验证连接
      await stripe.prices.list({ limit: 1 });
      stripeConnectionStatus = "成功";
    } catch (error) {
      stripeConnectionStatus = `失败: ${error instanceof Error ? error.message : "未知错误"}`;
    }

    return NextResponse.json({
      success: true,
      config,
      stripeConnection: stripeConnectionStatus,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error("配置检查失败:", error);
    return NextResponse.json(
      { 
        error: "配置检查失败",
        details: error instanceof Error ? error.message : "未知错误"
      },
      { status: 500 }
    );
  }
} 