import { createId } from "@paralleldrive/cuid2";
import { createClient } from "~/lib/supabase/server";
import type { UserCreditBalance, CreditTransaction } from "~/lib/database-types";

/**
 * 积分服务 - 仅依赖 user, user_credit_balance, credit_transaction, subscription_credits
 */

/**
 * 安全的积分消费
 */
export async function consumeCreditsWithTransaction(
  userId: string,
  amount: number,
  description?: string,
) {
  const supabase = await createClient();
  // 查询余额
  const { data: userBalance } = await supabase
    .from("user_credit_balance")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (!userBalance || userBalance.balance < amount) {
    return {
      success: false,
      message: "积分不足",
      balance: userBalance?.balance ?? 0,
      required: amount,
    };
  }

  // 更新余额
  const newBalance = userBalance.balance - amount;
  const { error: updateError } = await supabase
    .from("user_credit_balance")
    .update({
      balance: newBalance,
      total_consumed: userBalance.total_consumed + amount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userBalance.id);
  if (updateError) {
    throw updateError;
  }

  // 记录交易
  const transactionId = createId();
  const { error: transactionError } = await supabase
    .from("credit_transaction")
    .insert({
      id: transactionId,
      user_id: userId,
      amount: -amount,
      balance_after: newBalance,
      type: "consumption",
      description: description || `消费${amount}积分`,
      created_at: new Date().toISOString(),
    });
  if (transactionError) {
    throw transactionError;
  }

  return {
    success: true,
    balance: newBalance,
    consumed: amount,
    transactionId,
  };
}

/**
 * 添加奖励积分
 */
export async function addBonusCreditsWithTransaction(
  userId: string,
  amount: number,
  reason: string,
  metadata: Record<string, any> = {},
) {
  const supabase = await createClient();
  // 查询或创建余额
  let { data: userBalance } = await supabase
    .from("user_credit_balance")
    .select("*")
    .eq("user_id", userId)
    .single();
  if (!userBalance) {
    const { data: newBalance, error: insertError } = await supabase
      .from("user_credit_balance")
      .insert({
        id: createId(),
        user_id: userId,
        balance: amount,
        total_consumed: 0,
        total_recharged: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (insertError) throw insertError;
    userBalance = newBalance;
  } else {
    const newBalance = userBalance.balance + amount;
    const { error: updateError } = await supabase
      .from("user_credit_balance")
      .update({
        balance: newBalance,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userBalance.id);
    if (updateError) throw updateError;
    userBalance.balance = newBalance;
  }
  // 记录交易
  const transactionId = createId();
  const { error: transactionError } = await supabase
    .from("credit_transaction")
    .insert({
      id: transactionId,
      user_id: userId,
      amount: amount,
      balance_after: userBalance.balance,
      type: "bonus",
      description: reason,
      metadata: JSON.stringify(metadata),
      created_at: new Date().toISOString(),
    });
  if (transactionError) throw transactionError;
  return {
    success: true,
    balance: userBalance.balance,
    added: amount,
    transactionId,
  };
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
