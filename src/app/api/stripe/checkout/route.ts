import { NextRequest, NextResponse } from "next/server";
import { stripe } from "~/lib/stripe";
import { createClient } from "~/lib/supabase/server";

interface CheckoutRequest {
  priceId: string;
  interval: "month" | "year";
}

export async function POST(request: NextRequest) {
  try {
    // 1. 检查环境变量
    const requiredEnvVars = {
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    };

    const missingEnvVars = Object.entries(requiredEnvVars)
      .filter(([key, value]) => !value)
      .map(([key]) => key);

    if (missingEnvVars.length > 0) {
      console.error("缺少环境变量:", missingEnvVars);
      return NextResponse.json(
        { 
          error: "服务器配置错误",
          details: `缺少环境变量: ${missingEnvVars.join(", ")}` 
        },
        { status: 500 }
      );
    }

    // 2. 解析请求体
    let body: CheckoutRequest;
    try {
      const requestBody = await request.json();
      body = requestBody as CheckoutRequest;
    } catch (error) {
      console.error("请求体解析错误:", error);
      return NextResponse.json({ error: "无效的请求格式" }, { status: 400 });
    }

    const { priceId, interval } = body;

    if (!priceId) {
      return NextResponse.json({ error: "价格ID是必需的" }, { status: 400 });
    }

    console.log("开始创建checkout会话 - 价格ID:", priceId, "周期:", interval);

    // 3. 验证Stripe连接
    try {
      await stripe.prices.retrieve(priceId);
      console.log("价格ID验证成功:", priceId);
    } catch (error) {
      console.error("价格ID验证失败:", error);
      return NextResponse.json(
        { 
          error: "无效的价格ID",
          details: error instanceof Error ? error.message : "价格验证失败"
        },
        { status: 400 }
      );
    }

    // 4. 获取用户信息
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error("认证错误:", authError);
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    // 5. 查询用户配置信息
    const { data: userProfile, error: userInfoError } = await supabase
      .from("user_profiles")
      .select("id, customer_id, display_name")
      .eq("id", user.id)
      .single();

    if (userInfoError) {
      console.error("用户配置查询错误:", userInfoError);
      return NextResponse.json({ error: "用户配置不存在" }, { status: 400 });
    }

    // 合并用户信息（email来自auth.users，其他来自user_profiles）
    const userInfo = {
      id: user.id,
      email: user.email,
      name: userProfile?.display_name || user.user_metadata?.name || user.email?.split('@')[0],
      customer_id: userProfile?.customer_id
    };

    console.log("用户信息获取成功:", { userId: user.id, email: userInfo.email });

    // 6. 检查用户是否已有有效订阅
    const { data: activeSubscription, error: subscriptionError } = await supabase
      .from("subscription_status_monitor")
      .select("status")
      .in("status", ["active", "trialing"]) // 'active' 或 'trialing' 都算有效订阅
      .eq("user_id", user.id)
      .maybeSingle(); // 使用 maybeSingle，因为没有或只有一条记录

    if (subscriptionError) {
      console.error("查询有效订阅时出错:", subscriptionError);
      return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
    }

    // 如果已存在有效订阅，则创建客户门户会话
    if (activeSubscription) {
      console.log(`用户 ${user.id} 已有有效订阅，将创建客户门户会话。`);
      try {
        const portalSession = await stripe.billingPortal.sessions.create({
          customer: userProfile.customer_id as string,
          return_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing`, // 管理订阅后返回的页面
        });
        return NextResponse.json({ 
          url: portalSession.url,
          isSubscribed: true, // 添加一个标志，告诉前端这是管理链接
        });
      } catch (portalError) {
        console.error("创建Stripe客户门户会话失败:", portalError);
        return NextResponse.json({ error: "无法创建订阅管理会话" }, { status: 500 });
      }
    }

    // 7. 处理Stripe客户 (如果用户没有有效订阅)
    let customerId = userInfo.customer_id;
    if (!customerId) {
      console.log("创建新的Stripe客户");
      try {
        const customer = await stripe.customers.create({
          email: userInfo.email,
          name: userInfo.name || userInfo.email,
          metadata: { userId: user.id },
        });
        
        // 更新用户配置中的customer_id
        await supabase
          .from("user_profiles")
          .update({ customer_id: customer.id, updated_at: new Date().toISOString() })
          .eq("id", user.id);
        
        customerId = customer.id;
        console.log("新客户创建成功:", customerId);
      } catch (error) {
        console.error("创建Stripe客户失败:", error);
        return NextResponse.json(
          { 
            error: "创建客户失败",
            details: error instanceof Error ? error.message : "未知错误"
          },
          { status: 500 }
        );
      }
    }

    // 7. 创建checkout会话
    try {
      const checkoutSession = await stripe.checkout.sessions.create({
        customer: customerId,
        // -- FIX: 移除 customer_update[metadata]，Stripe 不支持 --
        // customer_update: {
        //   metadata: {
        //     userId: user.id,
        //   },
        // },
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        mode: "subscription",
        success_url: `${process.env.NEXT_PUBLIC_APP_URL}/face-swap?success=true`,
        cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing?canceled=true`,
        metadata: {
          userId: user.id,
          interval: interval,
        },
        allow_promotion_codes: true,
        billing_address_collection: 'auto',
        payment_method_types: ['card'],
      });

      console.log("Checkout会话创建成功:", checkoutSession.id);

      return NextResponse.json({ 
        url: checkoutSession.url,
        sessionId: checkoutSession.id,
        customerId: customerId
      });

    } catch (error) {
      console.error("创建checkout会话失败:", error);
      return NextResponse.json(
        { 
          error: "创建支付会话失败",
          details: error instanceof Error ? error.message : "未知错误"
        },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error("API处理过程中发生未知错误:", error);
    return NextResponse.json(
      { 
        error: "服务器内部错误",
        details: error instanceof Error ? error.message : "未知错误"
      },
      { status: 500 }
    );
  }
} 