import { createId } from "@paralleldrive/cuid2";
import { createClient } from "~/lib/supabase/server";
import type { UserCreditBalance, CreditTransaction } from "~/lib/database-types";

/**
 * 积分服务 - 仅依赖 user, user_credit_balance, credit_transaction, subscription_credits
 */

/**
 * 安全的积分消费 - 使用数据库函数实现原子操作
 */
export async function consumeCreditsWithTransaction(
  userId: string,
  amount: number,
  description?: string,
) {
  const supabase = await createClient();
  
  const { data: result, error } = await supabase.rpc('consume_credits_atomic', {
    p_user_id: userId,
    p_amount: amount,
    p_description: description || `消费${amount}积分`,
  });

  if (error) {
    console.error(`[consumeCredits] 数据库函数 consume_credits_atomic 调用失败:`, error);
    throw new Error(`数据库函数调用失败: ${error.message}`);
  }

  if (!result.success) {
    console.error(`[consumeCredits] 积分消费失败，函数返回:`, result);
    return {
      success: false,
      message: result.message || "积分消费失败",
      balance: result.balance ?? 0,
      required: result.required ?? amount,
    };
  }

  return {
    success: true,
    balance: result.balanceAfter,
    consumed: result.amountConsumed,
    transactionId: result.transactionId,
  };
}

/**
 * 添加奖励积分 - 修复版本，使用数据库函数避免RLS问题
 */
export async function addBonusCreditsWithTransaction(
  userId: string,
  amount: number,
  reason: string,
  metadata: Record<string, any> = {},
) {
  const supabase = await createClient();
  
  console.log(`[addBonusCreditsWithTransaction] 开始为用户 ${userId} 添加 ${amount} 积分，原因: ${reason}`);
  
  try {
    const { data: result, error } = await supabase.rpc('add_bonus_credits_v2', {
      p_user_id: userId,
      bonus_amount: amount,
      bonus_reason: reason,
      bonus_metadata: metadata
    });

    if (error) {
      console.error(`[addBonusCreditsWithTransaction] 数据库函数 add_bonus_credits_v2 调用失败:`, error);
      throw new Error(`数据库函数调用失败: ${error.message}`);
    }

    if (!result.success) {
      console.error(`[addBonusCreditsWithTransaction] 奖励积分添加失败，函数返回:`, result);
      throw new Error(result.message || '奖励积分添加失败，但未返回具体错误信息');
    }

    console.log(`[addBonusCreditsWithTransaction] 成功为用户 ${userId} 添加 ${amount} 积分，新余额: ${result.balanceAfter}`);

    return {
      success: true,
      balance: result.balanceAfter,
      added: amount,
      transactionId: result.transactionId || 'unknown',
    };
  } catch (error) {
    console.error(`[addBonusCreditsWithTransaction] 为用户 ${userId} 添加奖励积分时发生未知错误:`, error);
    throw error; // 将错误继续向上抛出
  }
}

/**
 * 查询用户积分余额
 */
export async function getUserCreditBalance(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_credit_balance")
    .select("*")
    .eq("user_id", userId)
    .single();
  if (error) return null;
  return data;
}

/**
 * 查询用户积分交易记录
 */
export async function getUserCreditTransactions(
  userId: string,
  limit = 10,
  offset = 0,
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("credit_transaction")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) return [];
  return data || [];
}
