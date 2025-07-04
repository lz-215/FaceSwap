import { createId } from "@paralleldrive/cuid2";
import { createClient } from "~/lib/supabase/server";
import { stripe } from "~/lib/stripe";
import type Stripe from "stripe";

/**
 * 创建新客户（增强版）
 * 添加更多验证和错误处理，确保用户ID和Stripe客户ID的关联不会丢失
 */
export async function createCustomer(
  userId: string,
  email: string,
  name?: string,
) {
  console.log(`[createCustomer] 开始创建客户 - 用户ID: ${userId}, 邮箱: ${email}`);
  
  try {
    const supabase = await createClient();

    // 1. 验证用户是否存在
    const { data: user, error: userError } = await supabase
      .from("user")
      .select("id, email, name")
      .eq("id", userId)
      .single();

    if (userError || !user) {
      console.error(`[createCustomer] 用户不存在: ${userId}`, userError);
      throw new Error(`用户不存在: ${userId}`);
    }

    console.log(`[createCustomer] 用户验证通过:`, {
      id: user.id,
      email: user.email,
      name: user.name,
    });

    // 2. 检查是否已存在stripe_customer记录
    const { data: existingCustomer, error: existingError } = await supabase
      .from("stripe_customer")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (existingError && existingError.code !== 'PGRST116') {
      console.error(`[createCustomer] 查询stripe_customer失败:`, existingError);
      throw existingError;
    }

    console.log(`[createCustomer] 现有客户记录:`, {
      found: !!existingCustomer,
      customerId: existingCustomer?.customer_id,
      createdAt: existingCustomer?.created_at,
    });

    // 3. 如果已有记录，验证Stripe客户是否存在且有效
    if (existingCustomer) {
      try {
        const response = await stripe.customers.retrieve(existingCustomer.customer_id);
        const customer = (response as any).deleted ? null : response as Stripe.Customer;
        if (customer) {
          console.log(`[createCustomer] 现有Stripe客户:`, {
            id: customer.id,
            email: customer.email,
            deleted: (customer as any).deleted,
            metadata: customer.metadata,
          });

          if (!(customer as any).deleted) {
            // 验证客户metadata中的userId是否正确
            if (customer.metadata?.userId !== userId) {
              console.log(`[createCustomer] 更新客户metadata - 用户ID不匹配`);
              const updatedCustomer = await stripe.customers.update(customer.id, {
                metadata: {
                  ...customer.metadata,
                  userId,
                  updatedAt: new Date().toISOString(),
                  updatedBy: "createCustomer_validation",
                },
              });
              console.log(`[createCustomer] 已更新客户metadata`);
              return updatedCustomer;
            }

            console.log(`[createCustomer] 返回现有有效客户: ${customer.id}`);
            return customer;
          }
        } else {
          console.log(`[createCustomer] 现有客户已删除，需要重新创建`);
        }
      } catch (error) {
        console.error(`[createCustomer] 获取Stripe客户失败:`, error);
        console.log(`[createCustomer] 将创建新客户`);
      }
    }

    // 4. 查找Stripe是否已有该邮箱的customer
    let customer;
    console.log(`[createCustomer] 查找现有Stripe客户 - 邮箱: ${email}`);
    
    const customers = await stripe.customers.list({ 
      email, 
      limit: 10 // 增加限制以处理重复邮箱
    });
    
    console.log(`[createCustomer] 找到 ${customers.data.length} 个现有客户`);

    // 优先选择有userId metadata的客户
    const customerWithUserId = customers.data.find(c => c.metadata?.userId === userId);
    const customerWithoutUserId = customers.data.find(c => !c.metadata?.userId);

    if (customerWithUserId) {
      customer = customerWithUserId;
      console.log(`[createCustomer] 使用现有客户（匹配userId）: ${customer.id}`);
    } else if (customerWithoutUserId) {
      customer = customerWithoutUserId;
      console.log(`[createCustomer] 使用现有客户（无userId）: ${customer.id}`);
      
      // 更新客户metadata
      customer = await stripe.customers.update(customer.id, {
        metadata: {
          ...customer.metadata,
          userId,
          linkedBy: "createCustomer_auto",
          linkedAt: new Date().toISOString(),
        },
      });
      console.log(`[createCustomer] 已更新客户metadata`);
    } else {
      // 创建新客户
      console.log(`[createCustomer] 创建新Stripe客户`);
      customer = await stripe.customers.create({
        email,
        name: name || user.name || email,
        metadata: {
          userId,
          createdBy: "createCustomer_service",
          createdAt: new Date().toISOString(),
        },
      });
      console.log(`[createCustomer] 新客户创建成功: ${customer.id}`);
    }

    // 5. 更新或插入stripe_customer记录
    const customerRecord = {
      id: existingCustomer?.id || createId(),
      user_id: userId,
      customer_id: customer.id,
      created_at: existingCustomer?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    console.log(`[createCustomer] 保存stripe_customer记录:`, customerRecord);

    const { error } = await supabase
      .from("stripe_customer")
      .upsert(customerRecord, { 
        onConflict: "user_id",
      });

    if (error) {
      console.error(`[createCustomer] 保存客户信息到数据库失败:`, error);
      
      // 如果是唯一约束冲突，尝试更新现有记录
      if (error.code === '23505') {
        console.log(`[createCustomer] 尝试更新现有记录`);
        const { error: updateError } = await supabase
          .from("stripe_customer")
          .update({
            customer_id: customer.id,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId);
        
        if (updateError) {
          console.error(`[createCustomer] 更新客户信息失败:`, updateError);
          throw updateError;
        }
        console.log(`[createCustomer] 更新客户信息成功`);
      } else {
        throw error;
      }
    } else {
      console.log(`[createCustomer] 客户信息保存成功`);
    }

    // 6. 验证保存是否成功
    const { data: savedCustomer, error: verifyError } = await supabase
      .from("stripe_customer")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (verifyError || !savedCustomer) {
      console.error(`[createCustomer] 验证保存失败:`, verifyError);
      throw new Error("客户信息保存验证失败");
    }

    console.log(`[createCustomer] 客户创建完成:`, {
      userId,
      customerId: customer.id,
      email: customer.email,
      databaseRecordId: savedCustomer.id,
    });

    return customer;
  } catch (error) {
    console.error(`[createCustomer] 创建客户错误:`, error);
    
    // 记录错误到日志（可选）
    try {
      const supabase = await createClient();
      await supabase.rpc("log_stripe_error", {
        error_type: "create_customer_failed",
        user_id: userId,
        email: email,
        error_message: error instanceof Error ? error.message : "Unknown error",
        error_details: JSON.stringify(error),
        created_at: new Date().toISOString(),
      });
    } catch (logError) {
      console.error(`[createCustomer] 记录错误日志失败:`, logError);
    }
    
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
  const supabase = await createClient();
  const { data: customer, error } = await supabase
    .from("stripe_customer")
    .select("*")
    .eq("user_id", userId)
    .single();
  if (error || !customer) return null;
  try {
    const response = await stripe.customers.retrieve(customer.customer_id);
    if ((response as any).deleted) return null;
    return response as Stripe.Customer;
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
 * 验证用户和Stripe客户的关联
 */
export async function validateCustomerAssociation(userId: string, customerId: string) {
  try {
    const supabase = await createClient();
    const { data: stripeCustomer, error: dbError } = await supabase
      .from("stripe_customer")
      .select("*")
      .eq("user_id", userId)
      .eq("customer_id", customerId)
      .single();
    if (dbError || !stripeCustomer) {
      console.error(`[validateCustomerAssociation] 数据库关联验证失败:`, dbError);
      return false;
    }
    const response = await stripe.customers.retrieve(customerId);
    if ((response as any).deleted) {
      console.error(`[validateCustomerAssociation] Stripe客户已删除: ${customerId}`);
      return false;
    }
    const customer = response as Stripe.Customer;
    if ((customer as Stripe.Customer).metadata?.userId !== userId) {
      console.error(`[validateCustomerAssociation] Stripe客户metadata不匹配:`, {
        expected: userId,
        actual: (customer as Stripe.Customer).metadata?.userId,
      });
      return false;
    }
    console.log(`[validateCustomerAssociation] 关联验证通过: ${userId} -> ${customerId}`);
    return true;
  } catch (error) {
    console.error(`[validateCustomerAssociation] 验证失败:`, error);
    return false;
  }
}

/**
 * 修复客户关联
 */
export async function fixCustomerAssociation(userId: string, customerId: string) {
  try {
    const supabase = await createClient();
    const { data: user, error: userError } = await supabase
      .from("user")
      .select("id, email")
      .eq("id", userId)
      .single();
    if (userError || !user) {
      throw new Error(`用户不存在: ${userId}`);
    }
    const response = await stripe.customers.retrieve(customerId);
    if ((response as any).deleted) {
      throw new Error(`Stripe客户已删除: ${customerId}`);
    }
    const customer = response as Stripe.Customer;
    const { error: dbError } = await supabase
      .from("stripe_customer")
      .upsert({
        id: createId(),
        user_id: userId,
        customer_id: customerId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    if (dbError) {
      throw dbError;
    }
    await stripe.customers.update(customerId, {
      metadata: {
        ...customer.metadata,
        userId,
        fixedBy: "fixCustomerAssociation",
        fixedAt: new Date().toISOString(),
      },
    });
    console.log(`[fixCustomerAssociation] 关联修复成功: ${userId} -> ${customerId}`);
    return true;
  } catch (error) {
    console.error(`[fixCustomerAssociation] 修复失败:`, error);
    throw error;
  }
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
