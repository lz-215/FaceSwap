import { createId } from "@paralleldrive/cuid2";
import { createClient } from "~/lib/supabase/server";
import { stripe } from "~/lib/stripe";

/**
 * 积分服务 - 使用 Supabase HTTP API
 */

/**
 * 安全的积分消费函数
 * @param userId 用户ID
 * @param actionType 操作类型
 * @param uploadId 上传ID（可选）
 * @param description 描述（可选）
 * @returns 消费结果
 */
export async function consumeCreditsWithTransaction(
  userId: string,
  actionType: string,
  uploadId?: string,
  description?: string,
) {
  try {
    const supabase = await createClient();
    
    // 1. 获取操作所需积分配置
    const { data: config } = await supabase
      .from("credit_consumption_config")
      .select("*")
      .eq("action_type", actionType)
      .eq("is_active", true)
      .single();

    const creditsRequired = config?.credits_required || 1;

    // 2. 获取用户积分余额
    const { data: userBalance } = await supabase
      .from("user_credit_balance")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (!userBalance) {
      // 创建新用户积分记录
      const { error: insertError } = await supabase
        .from("user_credit_balance")
        .insert({
          id: createId(),
          user_id: userId,
          balance: 0,
          total_consumed: 0,
          total_recharged: 0,
        });
      
      if (insertError) {
        console.error("创建用户积分余额失败:", insertError);
      }
      
      return {
        success: false,
        message: "积分不足",
        balance: 0,
        required: creditsRequired,
      };
    }

    // 3. 检查积分是否充足
    if (userBalance.balance < creditsRequired) {
      return {
        success: false,
        message: "积分不足",
        balance: userBalance.balance,
        required: creditsRequired,
      };
    }

    // 4. 更新用户积分余额
    const newBalance = userBalance.balance - creditsRequired;
    const newTotalConsumed = userBalance.total_consumed + creditsRequired;

    const { error: updateError } = await supabase
      .from("user_credit_balance")
      .update({
        balance: newBalance,
        total_consumed: newTotalConsumed,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userBalance.id);

    if (updateError) {
      console.error("更新用户积分余额失败:", updateError);
      throw updateError;
    }

    // 5. 创建积分交易记录
    const transactionDescription = description || `${actionType} 消费${creditsRequired}积分`;
    const transactionId = createId();

    const { error: transactionError } = await supabase
      .from("credit_transaction")
      .insert({
        id: transactionId,
        user_id: userId,
        amount: -creditsRequired,
        balance_after: newBalance,
        description: transactionDescription,
        type: "consumption",
        metadata: JSON.stringify({
          actionType,
          uploadId,
          creditsRequired,
        }),
        related_upload_id: uploadId,
      });

    if (transactionError) {
      console.error("创建积分交易记录失败:", transactionError);
      throw transactionError;
    }

    return {
      success: true,
      balance: newBalance,
      consumed: creditsRequired,
      transactionId,
    };
  } catch (error) {
    console.error("积分消费失败:", error);
    throw error;
  }
}

/**
 * 安全的积分充值处理函数
 * @param rechargeId 充值记录ID
 * @param paymentIntentId 支付意图ID
 * @returns 处理结果
 */
export async function handleCreditRechargeWithTransaction(
  rechargeId: string,
  paymentIntentId: string,
) {
  try {
    const supabase = await createClient();
    
    // 1. 获取充值记录
    const { data: recharge } = await supabase
      .from("credit_recharge")
      .select("*")
      .eq("id", rechargeId)
      .eq("payment_intent_id", paymentIntentId)
      .single();

    if (!recharge) {
      throw new Error("充值记录不存在");
    }

    // 2. 检查是否已经处理过
    if (recharge.status === "completed") {
      console.log(`充值记录 ${rechargeId} 已经处理过，跳过重复处理`);
      return { recharge, success: true, duplicate: true };
    }

    // 3. 更新充值记录状态
    const { error: updateRechargeError } = await supabase
      .from("credit_recharge")
      .update({
        status: "completed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", rechargeId);

    if (updateRechargeError) {
      console.error("更新充值记录失败:", updateRechargeError);
      throw updateRechargeError;
    }

    // 4. 获取或创建用户积分余额记录
    let { data: userBalance } = await supabase
      .from("user_credit_balance")
      .select("*")
      .eq("user_id", recharge.user_id)
      .single();

    if (!userBalance) {
      // 创建新的积分余额记录
      const { data: newBalance, error: insertError } = await supabase
        .from("user_credit_balance")
        .insert({
          id: createId(),
          user_id: recharge.user_id,
          balance: recharge.amount,
          total_consumed: 0,
          total_recharged: recharge.amount,
        })
        .select()
        .single();

      if (insertError) {
        console.error("创建用户积分余额失败:", insertError);
        throw insertError;
      }

      userBalance = newBalance;
    } else {
      // 更新现有积分余额
      const newBalance = userBalance.balance + recharge.amount;
      const newTotalRecharged = userBalance.total_recharged + recharge.amount;

      const { error: updateBalanceError } = await supabase
        .from("user_credit_balance")
        .update({
          balance: newBalance,
          total_recharged: newTotalRecharged,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userBalance.id);

      if (updateBalanceError) {
        console.error("更新用户积分余额失败:", updateBalanceError);
        throw updateBalanceError;
      }

      userBalance.balance = newBalance;
      userBalance.total_recharged = newTotalRecharged;
    }

    // 5. 创建积分交易记录
    const transactionId = createId();
    const { error: transactionError } = await supabase
      .from("credit_transaction")
      .insert({
        id: transactionId,
        user_id: recharge.user_id,
        amount: recharge.amount,
        balance_after: userBalance.balance,
        type: "recharge",
        description: `充值 ${recharge.amount} 积分`,
        metadata: JSON.stringify({
          rechargeId,
          paymentIntentId,
          amount: recharge.amount,
        }),
        related_recharge_id: rechargeId,
      });

    if (transactionError) {
      console.error("创建积分交易记录失败:", transactionError);
      throw transactionError;
    }

    return {
      success: true,
      recharge,
      balance: userBalance.balance,
      transactionId,
    };
  } catch (error) {
    console.error("积分充值处理失败:", error);
    throw error;
  }
}

/**
 * 添加奖励积分
 * @param userId 用户ID
 * @param amount 积分数量
 * @param reason 原因
 * @param metadata 元数据
 * @returns 处理结果
 */
export async function addBonusCreditsWithTransaction(
  userId: string,
  amount: number,
  reason: string,
  metadata: Record<string, any> = {},
) {
  try {
    const supabase = await createClient();
    
    // 获取或创建用户积分余额记录
    let { data: userBalance } = await supabase
      .from("user_credit_balance")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (!userBalance) {
      // 创建新的积分余额记录
      const { data: newBalance, error: insertError } = await supabase
        .from("user_credit_balance")
        .insert({
          id: createId(),
          user_id: userId,
          balance: amount,
          total_consumed: 0,
          total_recharged: 0,
        })
        .select()
        .single();

      if (insertError) {
        console.error("创建用户积分余额失败:", insertError);
        throw insertError;
      }

      userBalance = newBalance;
    } else {
      // 更新现有积分余额
      const newBalance = userBalance.balance + amount;

      const { error: updateError } = await supabase
        .from("user_credit_balance")
        .update({
          balance: newBalance,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userBalance.id);

      if (updateError) {
        console.error("更新用户积分余额失败:", updateError);
        throw updateError;
      }

      userBalance.balance = newBalance;
    }

    // 创建积分交易记录
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
      });

    if (transactionError) {
      console.error("创建积分交易记录失败:", transactionError);
      throw transactionError;
    }

    return {
      success: true,
      balance: userBalance.balance,
      added: amount,
      transactionId,
    };
  } catch (error) {
    console.error("添加奖励积分失败:", error);
    throw error;
  }
}

/**
 * 创建幂等的积分充值记录
 * @param userId 用户ID
 * @param packageId 套餐ID
 * @param idempotencyKey 幂等性键
 * @returns 充值记录
 */
export async function createCreditRechargeIdempotent(
  userId: string,
  packageId: string,
  idempotencyKey: string,
) {
  try {
    const supabase = await createClient();
    
    // 检查是否已存在相同的幂等性键
    const { data: existingRecharge } = await supabase
      .from("credit_recharge")
      .select("*")
      .eq("user_id", userId)
      .eq("metadata", JSON.stringify({ idempotencyKey }))
      .single();

    if (existingRecharge) {
      return existingRecharge;
    }

    // 获取积分套餐信息
    const { data: creditPackage } = await supabase
      .from("credit_package")
      .select("*")
      .eq("id", packageId)
      .eq("is_active", true)
      .single();

    if (!creditPackage) {
      throw new Error("积分套餐不存在或已停用");
    }

    // 创建新的充值记录
    const rechargeId = createId();
    const { data: newRecharge, error: insertError } = await supabase
      .from("credit_recharge")
      .insert({
        id: rechargeId,
        user_id: userId,
        amount: creditPackage.credits,
        price: creditPackage.price,
        currency: creditPackage.currency || "usd",
        status: "pending",
        metadata: JSON.stringify({ idempotencyKey, packageId }),
      })
      .select()
      .single();

    if (insertError) {
      console.error("创建充值记录失败:", insertError);
      throw insertError;
    }

    return newRecharge;
  } catch (error) {
    console.error("创建积分充值记录失败:", error);
    throw error;
  }
}

// 简化版本的辅助函数，保持兼容性
export async function addBonusCredits(
  userId: string,
  amount: number,
  reason: string,
  metadata: Record<string, any> = {},
) {
  return addBonusCreditsWithTransaction(userId, amount, reason, metadata);
}

export async function consumeCredits(
  userId: string,
  actionType: string,
  uploadId?: string,
  description?: string,
) {
  return consumeCreditsWithTransaction(userId, actionType, uploadId, description);
}

export async function createCreditRecharge(userId: string, packageId: string) {
  const idempotencyKey = createId();
  return createCreditRechargeIdempotent(userId, packageId, idempotencyKey);
}

export async function handleCreditRechargeSuccess(
  rechargeId: string,
  paymentIntentId: string,
) {
  return handleCreditRechargeWithTransaction(rechargeId, paymentIntentId);
}

export async function getCreditConsumptionConfig(actionType: string) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("credit_consumption_config")
      .select("*")
      .eq("action_type", actionType)
      .eq("is_active", true)
      .single();

    if (error) {
      console.error("获取积分消费配置失败:", error);
      return null;
    }

    return data;
  } catch (error) {
    console.error("获取积分消费配置失败:", error);
    return null;
  }
}

export async function getCreditPackages() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("credit_package")
      .select("*")
      .eq("is_active", true)
      .order("credits", { ascending: true });

    if (error) {
      console.error("获取积分套餐失败:", error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error("获取积分套餐失败:", error);
    return [];
  }
}

export async function getUserCreditBalance(userId: string) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("user_credit_balance")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (error) {
      console.error("获取用户积分余额失败:", error);
      return null;
    }

    return data;
  } catch (error) {
    console.error("获取用户积分余额失败:", error);
    return null;
  }
}

export async function getUserCreditRecharges(
  userId: string,
  limit = 10,
  offset = 0,
) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("credit_recharge")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("获取用户充值记录失败:", error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error("获取用户充值记录失败:", error);
    return [];
  }
}

export async function getUserCreditTransactions(
  userId: string,
  limit = 10,
  offset = 0,
) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("credit_transaction")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("获取用户交易记录失败:", error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error("获取用户交易记录失败:", error);
    return [];
  }
}
