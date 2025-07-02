import { NextRequest, NextResponse } from "next/server";
import { createClient } from "~/lib/supabase/server";

/**
 * 管理员API - 手动修复积分问题
 * 
 * 用法:
 * POST /api/admin/fix-credits
 * { 
 *   "action": "fix_orphaned_recharges" | "retry_failed_payments" | "recalculate_balance",
 *   "userId": "optional_user_id",
 *   "rechargeId": "optional_recharge_id"
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const { action, userId, rechargeId } = await request.json();

    // 验证管理员权限（根据你的认证系统调整）
    const isAdmin = await validateAdminAccess(request);
    if (!isAdmin) {
      return NextResponse.json(
        { error: "权限不足", success: false },
        { status: 403 }
      );
    }

    const supabase = await createClient();
    let result;

    switch (action) {
      case "fix_orphaned_recharges":
        result = await fixOrphanedRecharges(supabase, userId);
        break;
      
      case "retry_failed_payments":
        result = await retryFailedPayments(supabase);
        break;
      
      case "recalculate_balance":
        result = await recalculateUserBalance(supabase, userId);
        break;
      
      case "fix_specific_recharge":
        if (!rechargeId) {
          throw new Error("需要提供 rechargeId");
        }
        result = await fixSpecificRecharge(supabase, rechargeId);
        break;
      
      default:
        throw new Error(`未知的操作: ${action}`);
    }

    return NextResponse.json({
      success: true,
      action,
      result,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error("[admin/fix-credits] 修复积分时出错:", error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : "未知错误",
        success: false 
      },
      { status: 500 }
    );
  }
}

/**
 * 获取系统状态
 */
export async function GET(request: NextRequest) {
  try {
    const isAdmin = await validateAdminAccess(request);
    if (!isAdmin) {
      return NextResponse.json(
        { error: "权限不足", success: false },
        { status: 403 }
      );
    }

    const supabase = await createClient();
    const status = await getSystemStatus(supabase);

    return NextResponse.json({
      success: true,
      status,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error("[admin/fix-credits] 获取系统状态时出错:", error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : "未知错误",
        success: false 
      },
      { status: 500 }
    );
  }
}

async function validateAdminAccess(request: NextRequest): Promise<boolean> {
  // 实现你的管理员权限验证逻辑
  // 例如：检查 JWT token、API key 等
  const authHeader = request.headers.get("authorization");
  const adminKey = process.env.ADMIN_API_KEY;
  
  if (!authHeader || !adminKey) {
    return false;
  }
  
  return authHeader === `Bearer ${adminKey}`;
}

async function fixOrphanedRecharges(supabase: any, targetUserId?: string) {
  console.log("[admin] 开始修复孤立的充值记录");

  // 查找孤立的充值记录
  let query = supabase
    .from("credit_recharge")
    .select(`
      id,
      user_id,
      amount,
      payment_intent_id,
      price,
      currency,
      updated_at,
      credit_transaction!left (id)
    `)
    .eq("status", "completed")
    .is("credit_transaction.id", null)
    .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

  if (targetUserId) {
    query = query.eq("user_id", targetUserId);
  }

  const { data: orphanedRecharges, error } = await query;

  if (error) {
    throw new Error(`查找孤立充值记录失败: ${error.message}`);
  }

  if (!orphanedRecharges || orphanedRecharges.length === 0) {
    return { message: "没有找到孤立的充值记录", fixedCount: 0 };
  }

  console.log(`[admin] 发现 ${orphanedRecharges.length} 条孤立的充值记录`);

  let fixedCount = 0;
  const results = [];

  for (const recharge of orphanedRecharges) {
    try {
      // 使用 RPC 函数修复
      const { data: result, error: rpcError } = await supabase.rpc('handle_stripe_webhook_payment_success', {
        p_payment_intent_id: recharge.payment_intent_id,
        p_recharge_id: recharge.id
      });

      if (rpcError) {
        console.error(`[admin] 修复充值记录 ${recharge.id} 失败:`, rpcError);
        results.push({
          rechargeId: recharge.id,
          success: false,
          error: rpcError.message,
        });
      } else {
        console.log(`[admin] 成功修复充值记录 ${recharge.id}`);
        fixedCount++;
        results.push({
          rechargeId: recharge.id,
          success: true,
          newBalance: result.newBalance,
        });
      }
    } catch (error) {
      console.error(`[admin] 修复充值记录 ${recharge.id} 时出错:`, error);
      results.push({
        rechargeId: recharge.id,
        success: false,
        error: error instanceof Error ? error.message : "未知错误",
      });
    }
  }

  return {
    message: `成功修复 ${fixedCount}/${orphanedRecharges.length} 条记录`,
    fixedCount,
    totalFound: orphanedRecharges.length,
    results,
  };
}

async function retryFailedPayments(supabase: any) {
  console.log("[admin] 开始重试失败的支付");

  const { data: result, error } = await supabase.rpc('retry_failed_payments');

  if (error) {
    throw new Error(`重试失败支付时出错: ${error.message}`);
  }

  return result;
}

async function recalculateUserBalance(supabase: any, userId: string) {
  console.log(`[admin] 重新计算用户 ${userId} 的积分余额`);

  // 计算用户的正确积分余额
  const { data: transactions, error: transError } = await supabase
    .from("credit_transaction")
    .select("type, amount")
    .eq("user_id", userId);

  if (transError) {
    throw new Error(`获取用户交易记录失败: ${transError.message}`);
  }

  const totalRecharged = transactions
    .filter(t => t.type === 'recharge')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalConsumed = transactions
    .filter(t => t.type === 'consumption')
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);

  const correctBalance = totalRecharged - totalConsumed;

  // 更新用户积分余额
  const { error: updateError } = await supabase
    .from("user_credit_balance")
    .upsert({
      user_id: userId,
      balance: correctBalance,
      total_recharged: totalRecharged,
      total_consumed: totalConsumed,
      updated_at: new Date().toISOString(),
    });

  if (updateError) {
    throw new Error(`更新用户积分余额失败: ${updateError.message}`);
  }

  return {
    userId,
    correctBalance,
    totalRecharged,
    totalConsumed,
    message: "积分余额已重新计算并更新",
  };
}

async function fixSpecificRecharge(supabase: any, rechargeId: string) {
  console.log(`[admin] 修复特定的充值记录: ${rechargeId}`);

  // 获取充值记录
  const { data: recharge, error } = await supabase
    .from("credit_recharge")
    .select("*")
    .eq("id", rechargeId)
    .single();

  if (error) {
    throw new Error(`获取充值记录失败: ${error.message}`);
  }

  if (!recharge.payment_intent_id) {
    throw new Error("充值记录缺少 payment_intent_id");
  }

  // 使用 RPC 函数修复
  const { data: result, error: rpcError } = await supabase.rpc('handle_stripe_webhook_payment_success', {
    p_payment_intent_id: recharge.payment_intent_id,
    p_recharge_id: rechargeId
  });

  if (rpcError) {
    throw new Error(`修复充值记录失败: ${rpcError.message}`);
  }

  return {
    rechargeId,
    result,
    message: "充值记录修复成功",
  };
}

async function getSystemStatus(supabase: any) {
  // 获取系统状态统计
  const stats = await Promise.all([
    // 最近7天的充值数量
    supabase
      .from("credit_recharge")
      .select("*", { count: 'exact', head: true })
      .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    
    // 孤立的充值记录数量
    supabase
      .from("credit_recharge")
      .select(`
        id,
        credit_transaction!left (id)
      `, { count: 'exact', head: true })
      .eq("status", "completed")
      .is("credit_transaction.id", null)
      .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    
    // 待处理的支付数量
    supabase
      .from("credit_recharge")
      .select("*", { count: 'exact', head: true })
      .eq("status", "pending")
      .lt("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString()),
  ]);

  return {
    recentRecharges: stats[0].count || 0,
    orphanedRecharges: stats[1].count || 0,
    stuckPayments: stats[2].count || 0,
    healthStatus: (stats[1].count || 0) === 0 && (stats[2].count || 0) === 0 ? "healthy" : "needs_attention",
  };
} 