import { createId } from "@paralleldrive/cuid2";
import { createClient } from "~/lib/supabase/server";
import { stripe } from "~/lib/stripe";

/**
 * 创建新客户
 */
export async function createCustomer(
  userId: string,
  email: string,
  name?: string,
) {
  try {
    const supabase = await createClient();
    
    const customer = await stripe.customers.create({
      email,
      metadata: {
        userId,
      },
      name: name || email,
    });

    const { error } = await supabase
      .from("stripe_customer")
      .insert({
        id: createId(),
        user_id: userId,
        customer_id: customer.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (error) {
      console.error("保存客户信息到数据库失败:", error);
      throw error;
    }

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
    const supabase = await createClient();
    
    // 获取客户 ID，如果不存在则创建
    let customer = await getCustomerByUserId(userId);

    if (!customer) {
      // 获取用户信息
      const { data: userInfo } = await supabase
        .from("user")
        .select("email, name")
        .eq("id", userId)
        .single();

      if (!userInfo || !userInfo.email) {
        throw new Error("用户信息不存在");
      }

      const newCustomer = await createCustomer(
        userId,
        userInfo.email,
        userInfo.name,
      );
      
      customer = {
        id: createId(),
        user_id: userId,
        customer_id: newCustomer.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }

    // 创建结账会话
    const session = await stripe.checkout.sessions.create({
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?canceled=true`,
      customer: customer.customer_id,
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
  try {
    const supabase = await createClient();
    
    const { data: customer, error } = await supabase
      .from("stripe_customer")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (error) {
      console.error("获取客户信息失败:", error);
      return null;
    }

    return customer;
  } catch (error) {
    console.error("获取客户信息失败:", error);
    return null;
  }
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
      customer.customer_id,
    );
    return customerDetails;
  } catch (error) {
    console.error("获取客户详情错误:", error);
    return null;
  }
}

/**
 * 获取用户所有订阅
 */
export async function getUserSubscriptions(userId: string) {
  try {
    const supabase = await createClient();
    
    const { data: subscriptions, error } = await supabase
      .from("stripe_subscription")
      .select("*")
      .eq("user_id", userId);

    if (error) {
      console.error("获取用户订阅失败:", error);
      return [];
    }

    return subscriptions || [];
  } catch (error) {
    console.error("获取用户订阅失败:", error);
    return [];
  }
}

/**
 * 检查用户是否有有效订阅
 */
async function hasActiveSubscription(userId: string): Promise<boolean> {
  const subscriptions = await getUserSubscriptions(userId);
  return subscriptions.some((sub: any) => sub.status === "active");
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
    const supabase = await createClient();
    
    // 检查是否已存在
    const { data: existingSubscription } = await supabase
      .from("stripe_subscription")
      .select("*")
      .eq("subscription_id", subscriptionId)
      .single();

    if (existingSubscription) {
      // 更新现有订阅
      const { error } = await supabase
        .from("stripe_subscription")
        .update({
          status,
          updated_at: new Date().toISOString(),
        })
        .eq("subscription_id", subscriptionId);

      if (error) {
        console.error("更新订阅失败:", error);
        throw error;
      }

      return existingSubscription;
    }

    // 创建新订阅
    const { data: newSubscription, error: insertError } = await supabase
      .from("stripe_subscription")
      .insert({
        id: createId(),
        user_id: userId,
        customer_id: customerId,
        subscription_id: subscriptionId,
        product_id: productId,
        status,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error("创建订阅记录失败:", insertError);
      throw insertError;
    }

    return newSubscription;
  } catch (error) {
    console.error("同步订阅数据错误:", error);
    throw error;
  }
}

// 导出其他有用的函数
export {
  createCustomerPortalSession,
  getCheckoutUrl,
  getCustomerDetails,
  hasActiveSubscription,
};
