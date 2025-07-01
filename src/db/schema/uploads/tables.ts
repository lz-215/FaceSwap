import { relations } from 'drizzle-orm';
import { integer, pgTable, text, timestamp, pgEnum } from 'drizzle-orm/pg-core';

import { userTable } from '../users/tables';

export const uploadsTable = pgTable('uploads', {
  createdAt: timestamp('created_at').notNull().defaultNow(),
  creditConsumed: integer('credit_consumed'),
  id: text('id').primaryKey(),
  key: text('key').notNull(),
  type: text('type').notNull(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  url: text('url').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => userTable.id, { onDelete: 'cascade' }),
});

// 人脸交换状态枚举
export const faceSwapStatusEnum = pgEnum("face_swap_status", [
  "processing", // 处理中
  "completed", // 已完成
  "failed", // 失败
]);

// 人脸交换历史记录表
export const faceSwapHistoryTable = pgTable("face_swap_history", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => userTable.id, { onDelete: "cascade" }),
  
  // 图片信息
  originImageUrl: text("origin_image_url").notNull(), // 原始图片URL
  faceImageUrl: text("face_image_url").notNull(), // 人脸图片URL
  resultImageUrl: text("result_image_url"), // 结果图片URL
  
  // 处理信息
  status: text("status").notNull().default("processing"),
  errorMessage: text("error_message"), // 错误信息
  processingTime: integer("processing_time"), // 处理时间(毫秒)
  
  // 消费信息
  creditsConsumed: integer("credits_consumed").notNull().default(1),
  
  // 元数据
  metadata: text("metadata"), // JSON字符串存储额外信息
  
  // 时间戳
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"), // 完成时间
});

// Relations moved to relations.ts
/*
relations(uploadsTable, ({ one }) => ({
  user: one(userTable, {
    fields: [uploadsTable.userId],
    references: [userTable.id],
  }),
}));
*/
