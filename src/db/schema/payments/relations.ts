import { relations } from "drizzle-orm";

import { userTable } from "../users/tables";
import {
  polarCustomerTable,
  polarSubscriptionTable,
  stripeCustomerTable,
  stripeSubscriptionTable,
} from "./tables";

export const polarCustomerRelations = relations(
  polarCustomerTable,
  ({ one }) => ({
    user: one(userTable, {
      fields: [polarCustomerTable.userId],
      references: [userTable.id],
    }),
  }),
);

export const polarSubscriptionRelations = relations(
  polarSubscriptionTable,
  ({ one }) => ({
    user: one(userTable, {
      fields: [polarSubscriptionTable.userId],
      references: [userTable.id],
    }),
  }),
);

export const stripeCustomerRelations = relations(
  stripeCustomerTable,
  ({ one }) => ({
    user: one(userTable, {
      fields: [stripeCustomerTable.userId],
      references: [userTable.id],
    }),
  }),
);

export const stripeSubscriptionRelations = relations(
  stripeSubscriptionTable,
  ({ one }) => ({
    user: one(userTable, {
      fields: [stripeSubscriptionTable.userId],
      references: [userTable.id],
    }),
  }),
);

export const userRelations = relations(userTable, ({ many }) => ({
  polarCustomers: many(polarCustomerTable),
  polarSubscriptions: many(polarSubscriptionTable),
  stripeCustomers: many(stripeCustomerTable),
  stripeSubscriptions: many(stripeSubscriptionTable),
}));
