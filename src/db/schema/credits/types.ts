import type { InferSelectModel } from "drizzle-orm";

import type {
  creditConsumptionConfigTable,
  creditPackageTable,
  creditRechargeTable,
  creditTransactionTable,
  userCreditBalanceTable,
} from "./tables";

// 积分消费配置类型
export type CreditConsumptionConfig = InferSelectModel<
  typeof creditConsumptionConfigTable
>;

// 积分套餐类型
export type CreditPackage = InferSelectModel<typeof creditPackageTable>;

// 积分充值记录类型
export type CreditRecharge = InferSelectModel<typeof creditRechargeTable>;

// 积分充值状态类型
export type CreditRechargeStatus = "completed" | "failed" | "pending";

// 积分交易记录类型
export type CreditTransaction = InferSelectModel<typeof creditTransactionTable>;

// 积分交易类型
export type CreditTransactionType =
  | "bonus"
  | "consumption"
  | "expiration"
  | "recharge"
  | "refund"
  | "subscription";

// 用户积分余额类型
export type UserCreditBalance = InferSelectModel<typeof userCreditBalanceTable>;
