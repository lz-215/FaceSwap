import type { InferSelectModel } from "drizzle-orm";

import type {
  polarCustomerTable,
  polarSubscriptionTable,
  stripeCustomerTable,
  stripeSubscriptionTable,
} from "./tables";

export type PolarCustomer = InferSelectModel<typeof polarCustomerTable>;
export type PolarSubscription = InferSelectModel<typeof polarSubscriptionTable>;

// 新增 Stripe 相关类型
export type StripeCustomer = InferSelectModel<typeof stripeCustomerTable>;
export type StripeSubscription = InferSelectModel<
  typeof stripeSubscriptionTable
>;
