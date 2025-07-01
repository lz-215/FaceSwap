import { NextRequest, NextResponse } from "next/server";
import { stripe } from "~/lib/stripe";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get("customerId");
    const eventId = searchParams.get("eventId");

    if (eventId) {
      // 查看特定的 webhook 事件
      console.log(`[debug] 获取webhook事件: ${eventId}`);
      const event = await stripe.events.retrieve(eventId);
      
      return NextResponse.json({
        success: true,
        event: {
          id: event.id,
          type: event.type,
          created: event.created,
          data: event.data,
        },
      });
    }

    if (customerId) {
      // 查看客户信息
      console.log(`[debug] 获取客户信息: ${customerId}`);
      const customer = await stripe.customers.retrieve(customerId);
      
      if (customer.deleted) {
        return NextResponse.json({
          success: false,
          error: "客户已被删除",
        });
      }

      return NextResponse.json({
        success: true,
        customer: {
          id: customer.id,
          email: customer.email,
          name: customer.name,
          metadata: customer.metadata,
          created: customer.created,
        },
      });
    }

    // 获取最近的 webhook 事件
    console.log(`[debug] 获取最近的webhook事件`);
    const events = await stripe.events.list({ limit: 10 });
    
    const eventSummary = events.data.map(event => ({
      id: event.id,
      type: event.type,
      created: new Date(event.created * 1000).toISOString(),
      objectId: (event.data.object as any).id,
    }));

    return NextResponse.json({
      success: true,
      recentEvents: eventSummary,
      message: "最近的 10 个 webhook 事件",
    });

  } catch (error) {
    console.error("[debug] 调试失败:", error);
    
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "调试失败",
        success: false,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action, customerId, userId } = await request.json() as {
      action: string;
      customerId: string;
      userId: string;
    };

    if (action === "link-customer") {
      // 手动关联客户到用户
      if (!customerId || !userId) {
        return NextResponse.json(
          { error: "customerId 和 userId 都是必需的", success: false },
          { status: 400 }
        );
      }

      console.log(`[debug] 手动关联客户 ${customerId} 到用户 ${userId}`);
      
      // 更新客户的metadata
      const customer = await stripe.customers.update(customerId, {
        metadata: {
          userId: userId,
          linkedBy: "manual",
          linkedAt: new Date().toISOString(),
        },
      });

      return NextResponse.json({
        success: true,
        message: `客户 ${customerId} 已关联到用户 ${userId}`,
        customer: {
          id: customer.id,
          metadata: customer.metadata,
        },
      });
    }

    if (action === "simulate-webhook") {
      // 模拟 webhook 事件处理（用于测试）
      if (!customerId) {
        return NextResponse.json(
          { error: "customerId 是必需的", success: false },
          { status: 400 }
        );
      }

      console.log(`[debug] 模拟处理客户 ${customerId} 的订阅事件`);
      
      // 获取客户的订阅
      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        limit: 1,
      });

      if (subscriptions.data.length === 0) {
        return NextResponse.json(
          { error: "客户没有订阅", success: false },
          { status: 400 }
        );
      }

      const subscription = subscriptions.data[0];
      
      // 模拟 webhook 事件
      const mockEvent = {
        type: "customer.subscription.created",
        data: {
          object: subscription,
        },
        id: `evt_test_${Date.now()}`,
      };

      // 这里可以调用实际的webhook处理逻辑进行测试
      // 但需要小心，避免重复处理

      return NextResponse.json({
        success: true,
        message: "模拟webhook事件创建成功",
        mockEvent: {
          type: mockEvent.type,
          subscriptionId: subscription.id,
          customerId: subscription.customer,
          status: subscription.status,
        },
      });
    }

    return NextResponse.json(
      { error: "不支持的操作", success: false },
      { status: 400 }
    );

  } catch (error) {
    console.error("[debug] POST操作失败:", error);
    
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "操作失败",
        success: false,
      },
      { status: 500 }
    );
  }
} 
