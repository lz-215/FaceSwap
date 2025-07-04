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
      // 查找 user
      const { data: user, error: userError } = await supabase
        .from("user")
        .select("id")
        .eq("email", customer.email)
        .single();
      console.log('[db:user] select', { email: customer.email }, { data: user, error: userError });
      if (userError || !user) {
        console.log(`[跳过] Stripe customer ${customer.id} 邮箱 ${customer.email} 未找到本地用户`);
        continue;
      }
      // 查找 stripe_customer
      const { data: binding, error: bindingError } = await supabase
        .from("stripe_customer")
        .select("id")
        .eq("user_id", user.id)
        .single();
      console.log('[db:stripe_customer] select', { userId: user.id }, { data: binding, error: bindingError });
      if (bindingError || !binding) {
        // 补全绑定
        const { error: upsertError } = await supabase.from("stripe_customer").upsert({
          user_id: user.id,
          customer_id: customer.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: "customer_id" });
        console.log('[db:stripe_customer] upsert', { userId: user.id, customerId: customer.id }, { error: upsertError });
        if (upsertError) {
          console.error(`[失败] 绑定 user_id=${user.id} <-> customer_id=${customer.id} 失败:`, upsertError);
        } else {
          fixedCount++;
          console.log(`[修复] 绑定 user_id=${user.id} <-> customer_id=${customer.id} 成功`);
        }
      } else {
        // 已有绑定
        // console.log(`[已存在] user_id=${user.id} 已有 stripe_customer 绑定`);
      }
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