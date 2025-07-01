import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";

import { db } from "~/db";
import {
  stripeCustomerTable,
  stripeSubscriptionTable,
} from "~/db/schema/payments/tables";
import { userTable } from "~/db/schema/users/tables";
import { stripe } from "~/lib/stripe";

/**
 * 创建新客户 */
export async function createCustomer(
  userId: string,
  email: string,
  name?: string,
) {
  try {
    const customer = await stripe.customers.create({
      email,
      metadata: {
        userId,
      },
      name: name || email,
    });

    await db.insert(stripeCustomerTable).values({
      createdAt: new Date(),
      customerId: customer.id,
      id: createId(),
      updatedAt: new Date(),
      userId,
    });

    return customer;
  } catch (error) {
    console.error("创建客户错误:", error);
    throw error;
  }
}

/**
 * 创建客户门户会话
 */
async function createCustomerPortalSession(
  customerId: string,
): Promise<null | string> {
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing`,
    });

    return session.url;
  } catch (error) {
    console.error("创建客户门户会话错误:", error);
    return null;
  }
}

/**
 * 获取结账 URL
 */
async function getCheckoutUrl(
  userId: string,
  priceId: string,
): Promise<null | string> {
  try {
    // 获取客户 ID，如果不存在则创建
    let customer = await getCustomerByUserId(userId);

    if (!customer) {
      // 需要用户信息，这里需要根据实际情况获取
      const userInfo = await db.query.userTable.findFirst({
        where: eq(userTable.id, userId),
      });

      if (!userInfo || !userInfo.email) {
        throw new Error("用户信息不存在");
      }

      const newCustomer = await createCustomer(
        userId,
        userInfo.email,
        userInfo.name,
      );
      customer = {
        createdAt: new Date(),
        customerId: newCustomer.id,
        id: createId(),
        updatedAt: new Date(),
        userId,
      };
    }

    // 创建结账会话
    const session = await stripe.checkout.sessions.create({
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?canceled=true`,
      customer: customer.customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?success=true`,
    });

    return session.url;
  } catch (error) {
    console.error("生成结账 URL 错误:", error);
    return null;
  }
}

/**
 * 获取用户Stripe 客户信息
 */
export async function getCustomerByUserId(userId: string) {
  const customer = await db.query.stripeCustomerTable.findFirst({
    where: eq(stripeCustomerTable.userId, userId),
  });

  if (!customer) {
    return null;
  }

  return customer;
}

/**
 * 获取客户详情
 */
async function getCustomerDetails(userId: string) {
  const customer = await getCustomerByUserId(userId);

  if (!customer) {
    return null;
  }

  try {
    const customerDetails = await stripe.customers.retrieve(
      customer.customerId,
    );
    return customerDetails;
  } catch (error) {
    console.error("获取客户详情错误:", error);
    return null;
  }
}

/**
 * 获取用户所有订阅 */
export async function getUserSubscriptions(userId: string) {
  const subscriptions = await db.query.stripeSubscriptionTable.findMany({
    where: eq(stripeSubscriptionTable.userId, userId),
  });

  return subscriptions;
}

/**
 * 检查用户是否有有效订阅
 */
async function hasActiveSubscription(userId: string): Promise<boolean> {
  const subscriptions = await getUserSubscriptions(userId);
  return subscriptions.some((sub: typeof stripeSubscriptionTable.$inferSelect) => sub.status === "active");
}

/**
 * 同步订阅数据
 */
export async function syncSubscription(
  userId: string,
  customerId: string,
  subscriptionId: string,
  productId: string,
  status: string,
) {
  try {
    const existingSubscription =
      await db.query.stripeSubscriptionTable.findFirst({
        where: eq(stripeSubscriptionTable.subscriptionId, subscriptionId),
      });

    if (existingSubscription) {
      await db
        .update(stripeSubscriptionTable)
        .set({
          status,
          updatedAt: new Date(),
        })
        .where(eq(stripeSubscriptionTable.subscriptionId, subscriptionId));
      return existingSubscription;
    }

    const subscription = await db.insert(stripeSubscriptionTable).values({
      createdAt: new Date(),
      customerId,
      id: createId(),
      productId,
      status,
      subscriptionId,
      updatedAt: new Date(),
      userId,
    });

    return subscription;
  } catch (error) {
    console.error("同步订阅错误:", error);
    throw error;
  }
}
