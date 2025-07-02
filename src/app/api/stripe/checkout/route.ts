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

    const body = (await request.json()) as CheckoutRequest;
    const { priceId, interval } = body;

    if (!priceId) {
      return NextResponse.json({ error: "价格ID是必需的" }, { status: 400 });
    }
    
    // 获取或创建客户
    let customer = await getCustomerByUserId(user.id);

    if (!customer) {
      // 获取用户信息
      const { data: userInfo } = await supabase
        .from("user")
        .select("email, name")
        .eq("id", user.id)
        .single();

      if (!userInfo || !userInfo.email) {
        return NextResponse.json({ error: "用户信息不存在" }, { status: 400 });
      }

      const newCustomer = await createCustomer(
        user.id,
        userInfo.email,
        userInfo.name,
      );
      
      customer = {
        id: "",
        user_id: user.id,
        customer_id: newCustomer.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }

    // 创建结账会话
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customer.customer_id,
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
      sessionId: checkoutSession.id 
    });

  } catch (error) {
    console.error("创建checkout会话失败:", error);
    return NextResponse.json(
      { error: "创建checkout会话失败" },
      { status: 500 }
    );
  }
} 