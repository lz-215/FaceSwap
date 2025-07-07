import { supabase } from "../lib/supabase-client";
import { stripe } from "../lib/stripe";
import type Stripe from "stripe";

/**
 * 扫描 Stripe 所有 customer，补全 stripe_customer 绑定
 * - 仅当 user 存在且 stripe_customer 未绑定时补全
 */
async function fixStripeCustomerBinding() {
  let hasMore = true;
  let startingAfter: string | undefined = undefined;
  let fixedCount = 0;
  let checkedCount = 0;

  while (hasMore) {
    const customers: Stripe.ApiList<Stripe.Customer> = await stripe.customers.list({ limit: 100, starting_after: startingAfter });
    for (const customer of customers.data) {
      checkedCount++;
      if (!customer.email) continue;
      // 查找用户 - 使用 auth.users 查找（需要服务角色权限）
      // 注意：此脚本可能需要重新设计，因为现在用户数据在 auth.users 和 user_profiles 中
      console.log(`[警告] 此脚本需要更新以适配新的数据库架构`);
      console.log(`[跳过] Stripe customer ${customer.id} 邮箱 ${customer.email} - 脚本需要更新`);
      continue;
      
      // TODO: 需要重新实现此脚本以使用新的架构
      // 现在需要：
      // 1. 查找 auth.users 表获取用户ID（需要admin权限）
      // 2. 更新 user_profiles 表的 customer_id 字段
      // 而不是查找旧的 "user" 表和 "stripe_customer" 表
    }
    hasMore = customers.has_more;
    if (hasMore) {
      startingAfter = customers.data[customers.data.length - 1].id;
    }
  }
  console.log(`\n共检查 ${checkedCount} 个 Stripe customer，修复 ${fixedCount} 条绑定。`);
}

fixStripeCustomerBinding().catch((err) => {
  console.error("[脚本异常]", err);
  process.exit(1);
}); 