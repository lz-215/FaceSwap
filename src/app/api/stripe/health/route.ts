import { NextResponse } from 'next/server';
import { stripe } from '~/lib/stripe';

/**
 * Stripe配置健康检查API
 * 用于验证所有Stripe相关配置是否正确
 */
export async function GET() {
  try {
    // 检查Stripe连接
    const account = await stripe.accounts.retrieve();
    
    // 检查必需的环境变量
    const envCheck = {
      STRIPE_SECRET_KEY: !!process.env.STRIPE_SECRET_KEY,
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
      STRIPE_WEBHOOK_SECRET: !!process.env.STRIPE_WEBHOOK_SECRET,
      STRIPE_PREMIUM_PRICE_ID: !!process.env.STRIPE_PREMIUM_PRICE_ID,
      STRIPE_PRO_PRICE_ID: !!process.env.STRIPE_PRO_PRICE_ID,
    };

    // 计算配置完整度
    const configuredCount = Object.values(envCheck).filter(Boolean).length;
    const totalCount = Object.keys(envCheck).length;
    const completeness = Math.round((configuredCount / totalCount) * 100);

    // 检查webhook端点URL
    const webhookUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}/api/webhooks/stripe`
      : 'localhost:3000/api/webhooks/stripe';

    const recommendations: string[] = [];

    // 添加建议
    if (!envCheck.STRIPE_SECRET_KEY) {
      recommendations.push('❌ 缺少 STRIPE_SECRET_KEY - 添加您的Stripe密钥');
    }
    if (!envCheck.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
      recommendations.push('❌ 缺少 NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY - 添加您的Stripe公开密钥');
    }
    if (!envCheck.STRIPE_WEBHOOK_SECRET) {
      recommendations.push('❌ 缺少 STRIPE_WEBHOOK_SECRET - 配置Webhook密钥');
    }
    if (completeness === 100) {
      recommendations.push('✅ 所有配置都已设置完毕！');
    }

    const config = {
      stripe: {
        connected: true,
        accountId: account.id,
        accountName: account.business_profile?.name || account.email || 'Unknown',
        mode: process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_') ? 'live' : 'test',
      },
      environment: envCheck,
      completeness: `${completeness}%`,
      webhookEndpoint: webhookUrl,
      recommendations
    };

    return NextResponse.json({ 
      success: true, 
      status: completeness === 100 ? 'healthy' : 'needs_configuration',
      config 
    });

  } catch (error) {
    console.error('[stripe/health] Stripe健康检查失败:', error);
    
    // 如果Stripe连接失败，仍然检查环境变量
    const envCheck = {
      STRIPE_SECRET_KEY: !!process.env.STRIPE_SECRET_KEY,
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
      STRIPE_WEBHOOK_SECRET: !!process.env.STRIPE_WEBHOOK_SECRET,
      STRIPE_PREMIUM_PRICE_ID: !!process.env.STRIPE_PREMIUM_PRICE_ID,
      STRIPE_PRO_PRICE_ID: !!process.env.STRIPE_PRO_PRICE_ID,
    };

    return NextResponse.json({ 
      success: false,
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      environment: envCheck,
      recommendations: [
        '❌ Stripe连接失败 - 检查STRIPE_SECRET_KEY是否正确',
        '💡 确保使用正确的API密钥（live或test）',
        '💡 检查网络连接和Stripe服务状态'
      ]
    }, { status: 500 });
  }
} 