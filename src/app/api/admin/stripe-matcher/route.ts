import { NextRequest, NextResponse } from "next/server";
import { createClient } from "~/lib/supabase/server";
import { stripe } from "~/lib/stripe";
import type Stripe from "stripe";
import { createId } from "@paralleldrive/cuid2";
import { userMatcher } from "../../webhooks/stripe/utils/user-matcher";

/**
 * 管理员Stripe用户匹配工具
 * 
 * 功能：
 * - 查看待处理的支付和订阅
 * - 手动匹配用户ID和Stripe客户ID
 * - 修复数据不一致问题
 * - 批量处理待处理的记录
 */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");
    
    const supabase = await createClient();
    
    switch (action) {
      case "pending-subscriptions":
        return await getPendingSubscriptions(supabase);
      
      case "unmatched-customers":
        return await getUnmatchedCustomers(supabase);
      
      case "customer-info":
        const customerId = searchParams.get("customerId");
        if (!customerId) {
          return NextResponse.json({ error: "缺少customerId参数" }, { status: 400 });
        }
        return await getCustomerInfo(customerId);
      
      case "user-info":
        const userId = searchParams.get("userId");
        if (!userId) {
          return NextResponse.json({ error: "缺少userId参数" }, { status: 400 });
        }
        return await getUserInfo(supabase, userId);
      
      case "search-users":
        const query = searchParams.get("query");
        if (!query) {
          return NextResponse.json({ error: "缺少query参数" }, { status: 400 });
        }
        return await searchUsers(supabase, query);
      
      default:
        return NextResponse.json({ error: "未知的action" }, { status: 400 });
    }
  } catch (error) {
    console.error("[admin-stripe-matcher] GET请求错误:", error);
    return NextResponse.json(
      { error: "服务器错误", details: error instanceof Error ? error.message : "未知错误" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // 类型保护
    if (!body || typeof body !== 'object' || !('action' in body)) {
      return NextResponse.json({ error: "请求体缺少action字段" }, { status: 400 });
    }
    const { action } = body as { action: string };
    
    const supabase = await createClient();
    
    switch (action) {
      case "manual-match":
        return await manualMatch(supabase, body);
      
      case "batch-match":
        return await batchMatch(supabase, body);
      
      case "fix-pending-subscription":
        return await fixPendingSubscription(supabase, body);
      
      case "auto-match":
        return await autoMatch(supabase, body);
      
      default:
        return NextResponse.json({ error: "未知的action" }, { status: 400 });
    }
  } catch (error) {
    console.error("[admin-stripe-matcher] POST请求错误:", error);
    return NextResponse.json(
      { error: "服务器错误", details: error instanceof Error ? error.message : "未知错误" },
      { status: 500 }
    );
  }
}

/**
 * 获取待处理的订阅列表
 */
async function getPendingSubscriptions(supabase: any) {
  const { data: pendingSubscriptions, error } = await supabase
    .from("stripe_subscription")
    .select("*")
    .like("user_id", "pending_%")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    throw error;
  }

  return NextResponse.json({
    success: true,
    data: pendingSubscriptions,
    count: pendingSubscriptions?.length || 0,
  });
}

/**
 * 获取未匹配的客户列表
 */
async function getUnmatchedCustomers(supabase: any) {
  try {
    const { data: unmatchedCustomers, error } = await supabase
      .from("unmatched_stripe_customers")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(50);

    // 如果表不存在，返回空数组
    if (error && error.code === '42P01') {
      return NextResponse.json({
        success: true,
        data: [],
        count: 0,
        note: "unmatched_stripe_customers 表不存在"
      });
    }

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      data: unmatchedCustomers || [],
      count: unmatchedCustomers?.length || 0,
    });
  } catch (error) {
    console.error("获取未匹配客户失败:", error);
    return NextResponse.json({
      success: true,
      data: [],
      count: 0,
      error: error instanceof Error ? error.message : "未知错误"
    });
  }
}

/**
 * 获取Stripe客户信息
 */
async function getCustomerInfo(customerId: string) {
  try {
    const customer = await stripe.customers.retrieve(customerId);
    
    if ((customer as any).deleted) {
      return NextResponse.json({
        success: true,
        data: {
          id: customer.id,
          deleted: true,
        },
      });
    }
    const c = customer as Stripe.Customer;
    return NextResponse.json({
      success: true,
      data: {
        id: c.id,
        email: c.email,
        name: c.name,
        metadata: c.metadata,
        created: c.created,
        deleted: false,
      },
    });
  } catch (error) {
    console.error("获取客户信息失败:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "未知错误",
    });
  }
}

/**
 * 获取用户信息
 */
async function getUserInfo(supabase: any, userId: string) {
  const { data: user, error } = await supabase
    .from("user")
    .select("id, email, name, created_at")
    .eq("id", userId)
    .single();

  if (error) {
    return NextResponse.json({
      success: false,
      error: error.message,
    });
  }

  // 获取关联的Stripe客户信息
  const { data: stripeCustomer } = await supabase
    .from("stripe_customer")
    .select("*")
    .eq("user_id", userId)
    .single();

  return NextResponse.json({
    success: true,
    data: {
      user,
      stripeCustomer,
    },
  });
}

/**
 * 搜索用户
 */
async function searchUsers(supabase: any, query: string) {
  const { data: users, error } = await supabase
    .from("user")
    .select("id, email, name, created_at")
    .or(`email.ilike.%${query}%,name.ilike.%${query}%`)
    .limit(20);

  if (error) {
    throw error;
  }

  return NextResponse.json({
    success: true,
    data: users || [],
    count: users?.length || 0,
  });
}

/**
 * 手动匹配用户ID和Stripe客户ID
 */
async function manualMatch(supabase: any, body: any) {
  const { customerId, userId, note } = body;
  
  if (!customerId || !userId) {
    return NextResponse.json(
      { error: "customerId和userId都是必需的" },
      { status: 400 }
    );
  }

  try {
    // 1. 验证用户是否存在
    const { data: user, error: userError } = await supabase
      .from("user")
      .select("id, email")
      .eq("id", userId)
      .single();

    if (userError || !user) {
      return NextResponse.json(
        { error: "用户不存在或无效" },
        { status: 400 }
      );
    }

    // 2. 验证Stripe客户是否存在
    const customer = await stripe.customers.retrieve(customerId);
    if ((customer as any).deleted) {
      return NextResponse.json(
        { error: "Stripe客户已被删除" },
        { status: 400 }
      );
    }
    const c = customer as Stripe.Customer;

    // 3. 创建或更新stripe_customer记录
    const { error: stripeCustomerError } = await supabase
      .from("stripe_customer")
      .upsert({
        id: createId(),
        user_id: userId,
        customer_id: customerId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

    if (stripeCustomerError) {
      // 如果是唯一约束冲突，尝试更新
      if (stripeCustomerError.code === '23505') {
        const { error: updateError } = await supabase
          .from("stripe_customer")
          .update({
            customer_id: customerId,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId);

        if (updateError) {
          throw updateError;
        }
      } else {
        throw stripeCustomerError;
      }
    }

    // 4. 更新Stripe客户的metadata
    await stripe.customers.update(customerId, {
      metadata: {
        ...c.metadata,
        userId: userId,
        linkedBy: "manual_admin",
        linkedAt: new Date().toISOString(),
        note: note || "",
      },
    });

    // 5. 修复所有待处理的订阅
    const { data: fixedSubscriptions, error: fixError } = await supabase
      .from("stripe_subscription")
      .update({ user_id: userId })
      .eq("customer_id", customerId)
      .like("user_id", "pending_%")
      .select();

    if (fixError) {
      console.error("修复待处理订阅失败:", fixError);
    }

    // 6. 标记未匹配记录为已处理
    try {
      await supabase
        .from("unmatched_stripe_customers")
        .update({ status: "resolved", resolved_at: new Date().toISOString() })
        .eq("customer_id", customerId);
    } catch (error) {
      console.error("更新未匹配记录状态失败:", error);
    }

    return NextResponse.json({
      success: true,
      message: "手动匹配成功",
      data: {
        userId,
        customerId,
        fixedSubscriptions: fixedSubscriptions?.length || 0,
      },
    });
  } catch (error) {
    console.error("手动匹配失败:", error);
    return NextResponse.json(
      { error: "手动匹配失败", details: error instanceof Error ? error.message : "未知错误" },
      { status: 500 }
    );
  }
}

/**
 * 自动匹配（使用增强匹配器）
 */
async function autoMatch(supabase: any, body: any) {
  const { customerId } = body;
  
  if (!customerId) {
    return NextResponse.json(
      { error: "customerId是必需的" },
      { status: 400 }
    );
  }

  try {
    const matchResult = await userMatcher.findUserByCustomerId(customerId);
    
    if (matchResult.userId) {
      // 自动匹配成功，修复相关订阅
      const { data: fixedSubscriptions, error: fixError } = await supabase
        .from("stripe_subscription")
        .update({ user_id: matchResult.userId })
        .eq("customer_id", customerId)
        .like("user_id", "pending_%")
        .select();

      return NextResponse.json({
        success: true,
        message: "自动匹配成功",
        data: {
          userId: matchResult.userId,
          customerId,
          matchMethod: matchResult.matchMethod,
          confidence: matchResult.confidence,
          fixedSubscriptions: fixedSubscriptions?.length || 0,
        },
      });
    } else {
      return NextResponse.json({
        success: false,
        message: "自动匹配失败",
        data: {
          customerId,
          matchMethod: matchResult.matchMethod,
          confidence: matchResult.confidence,
        },
      });
    }
  } catch (error) {
    console.error("自动匹配失败:", error);
    return NextResponse.json(
      { error: "自动匹配失败", details: error instanceof Error ? error.message : "未知错误" },
      { status: 500 }
    );
  }
}

/**
 * 批量匹配
 */
async function batchMatch(supabase: any, body: any) {
  const { customerIds } = body;
  
  if (!Array.isArray(customerIds) || customerIds.length === 0) {
    return NextResponse.json(
      { error: "customerIds必须是非空数组" },
      { status: 400 }
    );
  }

  const results = [];
  
  for (const customerId of customerIds) {
    try {
      const matchResult = await userMatcher.findUserByCustomerId(customerId as string);
      
      if (matchResult.userId) {
        // 修复相关订阅
        const { data: fixedSubscriptions } = await supabase
          .from("stripe_subscription")
          .update({ user_id: matchResult.userId })
          .eq("customer_id", customerId)
          .like("user_id", "pending_%")
          .select();

        results.push({
          customerId: customerId as string,
          success: true,
          userId: matchResult.userId,
          matchMethod: matchResult.matchMethod,
          confidence: matchResult.confidence,
          fixedSubscriptions: fixedSubscriptions?.length || 0,
        });
      } else {
        results.push({
          customerId: customerId as string,
          success: false,
          reason: "未找到匹配的用户",
        });
      }
    } catch (error) {
      results.push({
        customerId: customerId as string,
        success: false,
        error: error instanceof Error ? error.message : "未知错误",
      });
    }
  }

  const successCount = results.filter(r => r.success).length;
  
  return NextResponse.json({
    success: true,
    message: `批量匹配完成: ${successCount}/${customerIds.length} 成功`,
    data: results,
  });
}

/**
 * 修复待处理订阅
 */
async function fixPendingSubscription(supabase: any, body: any) {
  const { subscriptionId, userId } = body;
  
  if (!subscriptionId || !userId) {
    return NextResponse.json(
      { error: "subscriptionId和userId都是必需的" },
      { status: 400 }
    );
  }

  try {
    // 验证用户是否存在
    const { data: user, error: userError } = await supabase
      .from("user")
      .select("id")
      .eq("id", userId)
      .single();

    if (userError || !user) {
      return NextResponse.json(
        { error: "用户不存在或无效" },
        { status: 400 }
      );
    }

    // 更新订阅记录
    const { error: updateError } = await supabase
      .from("stripe_subscription")
      .update({ user_id: userId })
      .eq("subscription_id", subscriptionId);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({
      success: true,
      message: "待处理订阅修复成功",
      data: {
        subscriptionId,
        userId,
      },
    });
  } catch (error) {
    console.error("修复待处理订阅失败:", error);
    return NextResponse.json(
      { error: "修复失败", details: error instanceof Error ? error.message : "未知错误" },
      { status: 500 }
    );
  }
} 