import { relations } from "drizzle-orm";

import { uploadsTable } from "../uploads/tables";
import { userTable } from "../users/tables";
import {
  creditRechargeTable,
  creditTransactionTable,
  userCreditBalanceTable,
} from "./tables";

// 用户积分余额表关系
export const userCreditBalanceRelations = relations(
  userCreditBalanceTable,
  ({ one }) => ({
    user: one(userTable, {
      fields: [userCreditBalanceTable.userId],
      references: [userTable.id],
    }),
  }),
);

// 积分交易记录表关系
export const creditTransactionRelations = relations(
  creditTransactionTable,
  ({ one }) => ({
    recharge: one(creditRechargeTable, {
      fields: [creditTransactionTable.relatedRechargeId],
      references: [creditRechargeTable.id],
    }),
    upload: one(uploadsTable, {
      fields: [creditTransactionTable.relatedUploadId],
      references: [uploadsTable.id],
    }),
    user: one(userTable, {
      fields: [creditTransactionTable.userId],
      references: [userTable.id],
    }),
  }),
);

// 积分充值记录表关系
export const creditRechargeRelations = relations(
  creditRechargeTable,
  ({ one }) => ({
    user: one(userTable, {
      fields: [creditRechargeTable.userId],
      references: [userTable.id],
    }),
  }),
);
