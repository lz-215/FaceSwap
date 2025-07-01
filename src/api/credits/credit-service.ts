import { createId } from "@paralleldrive/cuid2";
// import { and, eq, sql } from "drizzle-orm";
// import type { PgTransaction } from "drizzle-orm/pg-core";
// import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
// import { db } from "~/db";
import { createClient } from "~/lib/supabase/server";
import type * as schema from "~/db/schema";
import {
  creditConsumptionConfigTable,
  creditPackageTable,
  creditRechargeTable,
  creditTransactionTable,
  userCreditBalanceTable,
} from "~/db/schema";
import { stripe } from "~/lib/stripe";

/**
 * 改进版积分服务 - 解决事务安全和并发问题
 */

// type DbTransaction = PgTransaction<PostgresJsQueryResultHKT, typeof schema>;

/**
 * 安全的积分消费函数（使用数据库事务和锁）
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
  return await db.transaction(async (tx: DbTransaction) => {
    try {
      // 1. 获取操作所需积分配置
      const config = await tx.query.creditConsumptionConfigTable.findFirst({
        where: and(
          eq(creditConsumptionConfigTable.actionType, actionType),
          eq(creditConsumptionConfigTable.isActive, 1),
        ),
      });

      const creditsRequired = config?.creditsRequired || 1;

      // 2. 锁定用户积分记录（SELECT FOR UPDATE）
      const userBalance = await tx
        .select()
        .from(userCreditBalanceTable)
        .where(eq(userCreditBalanceTable.userId, userId))
        .for("update")
        .limit(1);

      if (userBalance.length === 0) {
        // 创建新用户积分记录
        const newBalance = await tx
          .insert(userCreditBalanceTable)
          .values({
            balance: 0,
            createdAt: new Date(),
            id: createId(),
            totalConsumed: 0,
            totalRecharged: 0,
            updatedAt: new Date(),
            userId,
          })
          .returning();
        
        return {
          success: false,
          message: "积分不足",
          balance: 0,
          required: creditsRequired,
        };
      }

      const currentBalance = userBalance[0];

      // 3. 检查积分是否充足
      if (currentBalance.balance < creditsRequired) {
        return {
          success: false,
          message: "积分不足",
          balance: currentBalance.balance,
          required: creditsRequired,
        };
      }

      // 4. 更新用户积分余额
      const newBalance = currentBalance.balance - creditsRequired;
      const newTotalConsumed = currentBalance.totalConsumed + creditsRequired;

      await tx
        .update(userCreditBalanceTable)
        .set({
          balance: newBalance,
          totalConsumed: newTotalConsumed,
          updatedAt: new Date(),
        })
        .where(eq(userCreditBalanceTable.id, currentBalance.id));

      // 5. 创建积分交易记录
      const transactionDescription = description || `${actionType} 消费${creditsRequired}积分`;
      const transactionId = createId();

      await tx.insert(creditTransactionTable).values({
        amount: -creditsRequired,
        balanceAfter: newBalance,
        createdAt: new Date(),
        description: transactionDescription,
        id: transactionId,
        metadata: JSON.stringify({
          actionType,
          uploadId,
          creditsRequired,
        }),
        relatedUploadId: uploadId,
        type: "consumption",
        userId,
      });

      return {
        success: true,
        balance: newBalance,
        consumed: creditsRequired,
        transactionId,
      };
    } catch (error) {
      console.error("积分消费事务失败:", error);
      throw error;
    }
  });
}

/**
 * 安全的积分充值处理函数（使用数据库事务）
 * @param rechargeId 充值记录ID
 * @param paymentIntentId 支付意图ID
 * @returns 处理结果
 */
export async function handleCreditRechargeWithTransaction(
  rechargeId: string,
  paymentIntentId: string,
) {
  return await db.transaction(async (tx: DbTransaction) => {
    try {
      // 1. 获取充值记录并锁定
      const recharge = await tx
        .select()
        .from(creditRechargeTable)
        .where(
          and(
            eq(creditRechargeTable.id, rechargeId),
            eq(creditRechargeTable.paymentIntentId, paymentIntentId),
          ),
        )
        .for("update")
        .limit(1);

      if (recharge.length === 0) {
        throw new Error("充值记录不存在");
      }

      const rechargeRecord = recharge[0];

      // 2. 检查是否已经处理过（防止重复处理）
      if (rechargeRecord.status === "completed") {
        console.log(`充值记录 ${rechargeId} 已经处理过，跳过重复处理`);
        return { recharge: rechargeRecord, success: true, duplicate: true };
      }

      // 3. 更新充值记录状态
      await tx
        .update(creditRechargeTable)
        .set({
          status: "completed",
          updatedAt: new Date(),
        })
        .where(eq(creditRechargeTable.id, rechargeId));

      // 4. 获取或创建用户积分余额记录并锁定
      let userBalance = await tx
        .select()
        .from(userCreditBalanceTable)
        .where(eq(userCreditBalanceTable.userId, rechargeRecord.userId))
        .for("update")
        .limit(1);

      if (userBalance.length === 0) {
        // 创建新的积分余额记录
        const newBalance = await tx
          .insert(userCreditBalanceTable)
          .values({
            balance: rechargeRecord.amount,
            createdAt: new Date(),
            id: createId(),
            totalConsumed: 0,
            totalRecharged: rechargeRecord.amount,
            updatedAt: new Date(),
            userId: rechargeRecord.userId,
          })
          .returning();

        userBalance = newBalance;
      } else {
        // 更新现有积分余额
        const currentBalance = userBalance[0];
        const newBalance = currentBalance.balance + rechargeRecord.amount;
        const newTotalRecharged = currentBalance.totalRecharged + rechargeRecord.amount;

        await tx
          .update(userCreditBalanceTable)
          .set({
            balance: newBalance,
            totalRecharged: newTotalRecharged,
            updatedAt: new Date(),
          })
          .where(eq(userCreditBalanceTable.id, currentBalance.id));

        userBalance[0].balance = newBalance;
        userBalance[0].totalRecharged = newTotalRecharged;
      }

      // 5. 创建积分交易记录
      const transactionId = createId();
      await tx.insert(creditTransactionTable).values({
        amount: rechargeRecord.amount,
        balanceAfter: userBalance[0].balance,
        createdAt: new Date(),
        description: `充值${rechargeRecord.amount}积分`,
        id: transactionId,
        metadata: JSON.stringify({
          currency: rechargeRecord.currency,
          paymentIntentId,
          price: rechargeRecord.price,
          rechargeId,
        }),
        relatedRechargeId: rechargeId,
        type: "recharge",
        userId: rechargeRecord.userId,
      });

      return {
        success: true,
        recharge: rechargeRecord,
        newBalance: userBalance[0].balance,
        transactionId,
      };
    } catch (error) {
      console.error("积分充值事务失败:", error);
      throw error;
    }
  });
}

/**
 * 安全的奖励积分添加函数
 * @param userId 用户ID
 * @param amount 积分数量
 * @param reason 奖励原因
 * @param metadata 元数据
 * @returns 奖励结果
 */
export async function addBonusCreditsWithTransaction(
  userId: string,
  amount: number,
  reason: string,
  metadata: Record<string, any> = {},
) {
  console.log(`[addBonusCredits] 开始为用户 ${userId} 添加 ${amount} 积分，原因: ${reason}`);
  
  if (amount <= 0) {
    const error = "奖励积分必须大于0";
    console.error(`[addBonusCredits] 错误: ${error}`);
    throw new Error(error);
  }

  return await db.transaction(async (tx: DbTransaction) => {
    try {
      // 1. 获取或创建用户积分余额记录并锁定
      let userBalance = await tx
        .select()
        .from(userCreditBalanceTable)
        .where(eq(userCreditBalanceTable.userId, userId))
        .for("update")
        .limit(1);

      if (userBalance.length === 0) {
        // 创建新的积分余额记录
        const newBalance = await tx
          .insert(userCreditBalanceTable)
          .values({
            balance: amount,
            createdAt: new Date(),
            id: createId(),
            totalConsumed: 0,
            totalRecharged: amount,
            updatedAt: new Date(),
            userId,
          })
          .returning();

        userBalance = newBalance;
      } else {
        // 更新现有积分余额
        const currentBalance = userBalance[0];
        const newBalance = currentBalance.balance + amount;
        const newTotalRecharged = currentBalance.totalRecharged + amount;

        await tx
          .update(userCreditBalanceTable)
          .set({
            balance: newBalance,
            totalRecharged: newTotalRecharged,
            updatedAt: new Date(),
          })
          .where(eq(userCreditBalanceTable.id, currentBalance.id));

        userBalance[0].balance = newBalance;
        userBalance[0].totalRecharged = newTotalRecharged;
      }

      // 2. 创建积分交易记录
      const transactionId = createId();
      await tx.insert(creditTransactionTable).values({
        amount,
        balanceAfter: userBalance[0].balance,
        createdAt: new Date(),
        description: reason,
        id: transactionId,
        metadata: JSON.stringify(metadata),
        type: "bonus",
        userId,
      });

      console.log(`[addBonusCredits] 成功为用户 ${userId} 添加 ${amount} 积分，新余额: ${userBalance[0].balance}`);

      return {
        success: true,
        balance: userBalance[0].balance,
        amountAdded: amount,
        transactionId,
      };
    } catch (error) {
      console.error(`[addBonusCredits] 事务失败:`, error);
      throw error;
    }
  });
}

/**
 * 幂等的充值创建函数（防止重复创建）
 * @param userId 用户ID
 * @param packageId 套餐ID
 * @param idempotencyKey 幂等性密钥
 * @returns 创建的充值记录和客户端密钥
 */
export async function createCreditRechargeIdempotent(
  userId: string,
  packageId: string,
  idempotencyKey: string,
) {
  // 1. 检查是否已存在相同的充值记录
  const existingRecharge = await db.query.creditRechargeTable.findFirst({
    where: and(
      eq(creditRechargeTable.userId, userId),
      eq(creditRechargeTable.metadata, JSON.stringify({ idempotencyKey })),
    ),
  });

  if (existingRecharge && existingRecharge.paymentIntentId) {
    console.log(`使用现有充值记录: ${existingRecharge.id}`);
    
    // 获取现有的PaymentIntent
    const paymentIntent = await stripe.paymentIntents.retrieve(
      existingRecharge.paymentIntentId,
    );
    
    return {
      clientSecret: paymentIntent.client_secret,
      recharge: existingRecharge,
    };
  }

  // 2. 获取套餐信息
  const creditPackage = await db.query.creditPackageTable.findFirst({
    where: and(
      eq(creditPackageTable.id, packageId),
      eq(creditPackageTable.isActive, 1),
    ),
  });

  if (!creditPackage) {
    throw new Error("积分套餐不存在或已停用");
  }

  return await db.transaction(async (tx: DbTransaction) => {
    // 3. 创建充值记录
    const rechargeId = createId();
    const recharge = await tx
      .insert(creditRechargeTable)
      .values({
        amount: creditPackage.credits,
        createdAt: new Date(),
        currency: creditPackage.currency,
        id: rechargeId,
        price: creditPackage.price,
        status: "pending",
        updatedAt: new Date(),
        userId,
        metadata: JSON.stringify({ idempotencyKey, packageId }),
      })
      .returning();

    // 4. 创建 Stripe PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: creditPackage.price,
      currency: creditPackage.currency,
      metadata: {
        credits: creditPackage.credits.toString(),
        packageId,
        rechargeId,
        type: "credit_recharge",
        userId,
        idempotencyKey,
      },
    });

    // 5. 更新充值记录的 PaymentIntent ID
    await tx
      .update(creditRechargeTable)
      .set({
        paymentIntentId: paymentIntent.id,
        updatedAt: new Date(),
      })
      .where(eq(creditRechargeTable.id, rechargeId));

    return {
      clientSecret: paymentIntent.client_secret,
      recharge: recharge[0],
    };
  });
}

// ========== 兼容性函数 - 保持原有接口不变 ==========

/**
 * 添加奖励积分（兼容性函数）
 * @deprecated 使用 addBonusCreditsWithTransaction 替代
 */
export async function addBonusCredits(
  userId: string,
  amount: number,
  reason: string,
  metadata: Record<string, any> = {},
) {
  const result = await addBonusCreditsWithTransaction(userId, amount, reason, metadata);
  return {
    added: result.amountAdded,
    balance: result.balance,
    success: result.success,
    transactionId: result.transactionId,
  };
}

/**
 * 消费积分（兼容性函数）
 * @deprecated 使用 consumeCreditsWithTransaction 替代
 */
export async function consumeCredits(
  userId: string,
  actionType: string,
  uploadId?: string,
  description?: string,
) {
  return await consumeCreditsWithTransaction(userId, actionType, uploadId, description);
}

/**
 * 创建积分充值记录和支付意图（兼容性函数）
 * @deprecated 使用 createCreditRechargeIdempotent 替代
 */
export async function createCreditRecharge(userId: string, packageId: string) {
  const idempotencyKey = createId(); // 生成临时的幂等性密钥
  return await createCreditRechargeIdempotent(userId, packageId, idempotencyKey);
}

/**
 * 处理积分充值成功（兼容性函数）
 * @deprecated 使用 handleCreditRechargeWithTransaction 替代
 */
export async function handleCreditRechargeSuccess(
  rechargeId: string,
  paymentIntentId: string,
) {
  const result = await handleCreditRechargeWithTransaction(rechargeId, paymentIntentId);
  return result.recharge;
}

// ========== 原有的辅助函数 ==========

/**
 * 获取积分消费配置
 * @param actionType 操作类型
 * @returns 配置信息
 */
export async function getCreditConsumptionConfig(actionType: string) {
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
}

/**
 * 获取积分套餐列表
 * @returns 套餐列表
 */
export async function getCreditPackages() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("credit_package")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("price", { ascending: true });
  if (error) {
    console.error("获取积分套餐失败:", error);
    return [];
  }
  return data;
}

/**
 * 获取用户积分余额
 * @param userId 用户ID
 * @returns 用户积分余额
 */
export async function getUserCreditBalance(userId: string) {
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
}

/**
 * 获取用户充值记录
 * @param userId 用户ID
 * @param limit 限制数量
 * @param offset 偏移量
 * @returns 充值记录列表
 */
export async function getUserCreditRecharges(
  userId: string,
  limit = 10,
  offset = 0,
) {
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
  return data;
}

/**
 * 获取用户交易记录
 * @param userId 用户ID
 * @param limit 限制数量
 * @param offset 偏移量
 * @returns 交易记录列表
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
  if (error) {
    console.error("获取用户交易记录失败:", error);
    return [];
  }
  return data;
}
