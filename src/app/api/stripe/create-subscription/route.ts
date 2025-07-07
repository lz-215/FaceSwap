import { NextRequest, NextResponse } from "next/server";
import { createId } from "@paralleldrive/cuid2";
import { stripe } from "~/lib/stripe";
import { createClient } from "~/lib/supabase/server";
import { getUser } from "~/lib/auth/helper";

const MONTHLY_PRICE_ID = process.env.NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID;
const YEARLY_PRICE_ID = process.env.NEXT_PUBLIC_STRIPE_YEARLY_PRICE_ID;

interface CreateSubscriptionRequest {
  priceId: string;
  email?: string;
  name?: string;
}

export async function POST(request: NextRequest) {
  try {
    // 1. 获取当前用户
    const user = await getUser();
    if (!user) {
      return NextResponse.json(
        { error: "未登录", success: false },
        { status: 401 }
      );
    }

    // 2. 获取请求参数
    const { priceId, email, name } = await request.json() as CreateSubscriptionRequest;
    
    if (!priceId || ![MONTHLY_PRICE_ID, YEARLY_PRICE_ID].includes(priceId)) {
      return NextResponse.json(
        { error: "无效的价格ID", success: false },
        { status: 400 }
      );
    }

    console.log(`[subscription] 开始为用户 ${user.id} 创建订阅，价格ID: ${priceId}`);

    const supabase = await createClient();

    // 3. 检查是否已有 Stripe 客户 - 从用户配置和认证信息获取
    const { data: userProfile } = await supabase
      .from("user_profiles")
      .select("customer_id, display_name")
      .eq("id", user.id)
      .single();

    // 获取用户邮箱（来自auth.users）
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const userEmail = authUser?.email;
    const userName = name || userProfile?.display_name || authUser?.user_metadata?.name || userEmail;

    if (!userEmail) {
      return NextResponse.json({ error: "无法获取用户邮箱", success: false }, { status: 400 });
    }

    let customer: any;
    let customerId = userProfile?.customer_id;
    if (!customerId) {
      customer = await stripe.customers.create({
        email: email || userEmail,
        name: userName,
        metadata: {
          userId: user.id,
          createdFrom: "subscription_api",
          createdAt: new Date().toISOString(),
          faceSwap: 'true',
        },
      });
      await supabase
        .from("user_profiles")
        .update({ customer_id: customer.id, updated_at: new Date().toISOString() })
        .eq("id", user.id);
      customerId = customer.id;
    } else {
      customer = await stripe.customers.retrieve(customerId);
      if ((customer as any).deleted) {
        customer = await stripe.customers.create({
          email: email || userEmail,
          name: userName,
          metadata: {
            userId: user.id,
            createdFrom: "subscription_api",
            createdAt: new Date().toISOString(),
            faceSwap: 'true',
          },
        });
        await supabase
          .from("user_profiles")
          .update({ customer_id: customer.id, updated_at: new Date().toISOString() })
          .eq("id", user.id);
        customerId = customer.id;
      } else {
        // 更新现有客户的metadata
        customer = await stripe.customers.update(customerId, {
          email: email || userEmail,
          name: userName,
          metadata: {
            ...(customer as any).metadata,
            userId: user.id,
            updatedAt: new Date().toISOString(),
          },
        });
      }
    }

    console.log(`[subscription] 客户信息已更新/创建: ${customer.id}, userId: ${user.id}`);

    // 5. 创建订阅
    console.log(`[subscription] 为客户 ${customer.id} 创建订阅，价格 ${priceId}`);
    
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
      metadata: {
        userId: user.id,
        createdFrom: "subscription_api",
        createdAt: new Date().toISOString()
      }
    });

    console.log(`[subscription] 订阅创建成功: ${subscription.id}`);

    // 6. 返回客户端所需信息
    return NextResponse.json({
      success: true,
      subscriptionId: subscription.id,
      clientSecret: (subscription.latest_invoice as any)?.payment_intent?.client_secret,
    });

  } catch (error) {
    console.error("[subscription] 创建订阅失败:", error);
    
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "创建订阅失败",
        success: false,
      },
      { status: 500 }
    );
  }
}
