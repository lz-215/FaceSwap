import { integer, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { uploadsTable } from "../uploads/tables";
import { userTable } from "../users/tables";

// 积分交易类型枚举
export const creditTransactionTypeEnum = pgEnum("credit_transaction_type", [
    "recharge", // 充值
    "consumption", // 消费
    "refund", // 退款
    "bonus", // 奖励
    "subscription", // 订阅赠送
    "expiration", // 过期
]);

// 积分充值状态枚举
export const creditRechargeStatusEnum = pgEnum("credit_recharge_status", [
    "pending", // 待支付
    "completed", // 已完成
    "failed", // 失败
]);

// 用户积分余额表
export const userCreditBalanceTable = pgTable("user_credit_balance", {
    balance: integer("balance").notNull().default(0), // 当前积分余额
    createdAt: timestamp("created_at").defaultNow().notNull(),
    id: text("id").primaryKey(),
    totalConsumed: integer("total_consumed").notNull().default(0), // 累计消费积分
    totalRecharged: integer("total_recharged").notNull().default(0), // 累计充值积分
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    userId: text("user_id")
        .notNull()
        .references(() => userTable.id, { onDelete: "cascade" }),
});

// 积分交易记录表
export const creditTransactionTable = pgTable("credit_transaction", {
    amount: integer("amount").notNull(), // 交易积分数量（正数为增加，负数为减少）
    balanceAfter: integer("balance_after").notNull(), // 交易后余额
    createdAt: timestamp("created_at").defaultNow().notNull(),
    description: text("description"), // 交易描述
    id: text("id").primaryKey(),
    metadata: text("metadata"), // 交易元数据（JSON字符串）
    relatedRechargeId: text("related_recharge_id"), // 关联的充值ID（如果是充值类型）
    relatedUploadId: text("related_upload_id").references(() => uploadsTable.id), // 关联的上传ID（如果是消费类型）
    type: creditTransactionTypeEnum("type").notNull(), // 交易类型
    userId: text("user_id")
        .notNull()
        .references(() => userTable.id, { onDelete: "cascade" }),
});

// 积分充值记录表
export const creditRechargeTable = pgTable("credit_recharge", {
    amount: integer("amount").notNull(), // 充值积分数量
    createdAt: timestamp("created_at").defaultNow().notNull(),
    currency: text("currency").notNull().default("usd"), // 货币类型
    id: text("id").primaryKey(),
    metadata: text("metadata"), // 充值元数据（JSON字符串）
    paymentIntentId: text("payment_intent_id"), // Stripe支付意图ID
    paymentMethod: text("payment_method"), // 支付方式
    price: integer("price").notNull(), // 支付金额（美分）
    status: creditRechargeStatusEnum("status").notNull(), // 充值状态
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    userId: text("user_id")
        .notNull()
        .references(() => userTable.id, { onDelete: "cascade" }),
});

// 积分套餐表
export const creditPackageTable = pgTable("credit_package", {
    createdAt: timestamp("created_at").defaultNow().notNull(),
    credits: integer("credits").notNull(), // 积分数量
    currency: text("currency").notNull().default("usd"), // 货币类型
    description: text("description"), // 套餐描述
    id: text("id").primaryKey(),
    isActive: integer("is_active").notNull().default(1), // 是否激活
    isPopular: integer("is_popular").default(0), // 是否热门（不是热门）
    name: text("name").notNull(), // 套餐名称
    price: integer("price").notNull(), // 价格（美分）
    sortOrder: integer("sort_order").default(0), // 排序顺序
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// 积分消费配置表
export const creditConsumptionConfigTable = pgTable("credit_consumption_config", {
    actionType: text("action_type").notNull(), // 操作类型，如'colorize_image', 'enhance_image'?
    createdAt: timestamp("created_at").defaultNow().notNull(),
    creditsRequired: integer("credits_required").notNull(), // 所需积分数量
    description: text("description"), // 描述
    id: text("id").primaryKey(),
    isActive: integer("is_active").notNull().default(1), // 是否激活?
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
