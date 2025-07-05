import { NextRequest, NextResponse } from "next/server";
import { createCustomer, getCustomerByUserId } from "~/api/payments/stripe-service";
import { stripe } from "~/lib/stripe";
import { createClient } from "~/lib/supabase/server";

interface CheckoutRequest {
  priceId: string;
  interval: "month" | "year";
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // 获取当前用户
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    // 通过 user.id 查询 user 表，获取 customer_id、email、name
    const { data: userInfo, error: userInfoError } = await supabase
      .from("user")
      .select("id, customer_id, email, name")
      .eq("id", user.id)
      .single();

    if (userInfoError || !userInfo) {
      return NextResponse.json({ error: "用户信息不存在" }, { status: 400 });
    }

    let customerId = userInfo.customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userInfo.email,
        name: userInfo.name,
        metadata: { userId: user.id },
      });
      await supabase
        .from("user")
        .update({ customer_id: customer.id, updated_at: new Date().toISOString() })
        .eq("id", user.id);
      customerId = customer.id;
    }

    const body = (await request.json()) as CheckoutRequest;
    const { priceId, interval } = body;

    if (!priceId) {
      return NextResponse.json({ error: "价格ID是必需的" }, { status: 400 });
    }

    // 创建结账会话
    const checkoutSession = await stripe.checkout.sessions.create({
      // customer: customerId, // 注释掉，避免 customer_email 被忽略
      customer_email: userInfo.email, // 自动填入且不可修改
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing?canceled=true`,
      metadata: {
        userId: user.id,
        interval: interval,
      },
    });

    return NextResponse.json({ 
      url: checkoutSession.url,
      sessionId: checkoutSession.id,
      customerId: customerId
    });

  } catch (error) {
    console.error("创建checkout会话失败:", error);
    return NextResponse.json(
      { error: "创建checkout会话失败" },
      { status: 500 }
    );
  }
} 