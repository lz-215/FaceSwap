import { createId } from "@paralleldrive/cuid2";
import { createClient } from "~/lib/supabase/server";
import { stripe } from "~/lib/stripe";

interface UserMatchResult {
  userId: string | null;
  matchMethod: string;
  confidence: 'high' | 'medium' | 'low';
  metadata?: any;
}

/**
 * 增强的用户匹配器
 * 使用多种策略匹配用户ID和Stripe客户ID
 */
export class UserMatcher {
  private supabase = createClient();
  
  /**
   * 根据Stripe客户ID查找用户ID
   */
  async findUserByCustomerId(customerId: string): Promise<UserMatchResult> {
    console.log(`[UserMatcher] 开始查找用户 - customerId: ${customerId}`);

    // 策略1: 通过stripe_customer表查找
    const result1 = await this.findByStripeCustomerTable(customerId);
    if (result1.userId) {
      console.log(`[UserMatcher] 通过stripe_customer表找到用户: ${result1.userId}`);
      return result1;
    }

    // 策略2: 通过Stripe客户metadata查找
    const result2 = await this.findByStripeMetadata(customerId);
    if (result2.userId) {
      console.log(`[UserMatcher] 通过Stripe metadata找到用户: ${result2.userId}`);
      await this.createStripeCustomerRecord(result2.userId, customerId, 'metadata_match');
      return result2;
    }

    // 策略3: 通过邮箱匹配
    const result3 = await this.findByEmail(customerId);
    if (result3.userId) {
      console.log(`[UserMatcher] 通过邮箱找到用户: ${result3.userId}`);
      await this.createStripeCustomerRecord(result3.userId, customerId, 'email_match');
      await this.updateStripeCustomerMetadata(customerId, result3.userId, 'email_match');
      return result3;
    }

    // 策略4: 模糊匹配（通过客户名称）
    const result4 = await this.findByName(customerId);
    if (result4.userId) {
      console.log(`[UserMatcher] 通过名称找到用户: ${result4.userId}`);
      await this.createStripeCustomerRecord(result4.userId, customerId, 'name_match');
      await this.updateStripeCustomerMetadata(customerId, result4.userId, 'name_match');
      return result4;
    }

    console.log(`[UserMatcher] 所有策略都无法找到用户: ${customerId}`);
    return { userId: null, matchMethod: 'none', confidence: 'low' };
  }

  /**
   * 策略1: 通过stripe_customer表查找
   */
  private async findByStripeCustomerTable(customerId: string): Promise<UserMatchResult> {
    const supabase = await this.supabase;
    
    try {
      const { data: stripeCustomer, error } = await supabase
        .from("stripe_customer")
        .select("user_id, created_at")
        .eq("customer_id", customerId)
        .single();

      if (error) {
        console.log(`[UserMatcher] stripe_customer表查找失败:`, error);
        return { userId: null, matchMethod: 'stripe_customer_table', confidence: 'low' };
      }

      if (stripeCustomer?.user_id) {
        // 验证用户是否存在
        const { data: user, error: userError } = await supabase
          .from("user")
          .select("id, email")
          .eq("id", stripeCustomer.user_id)
          .single();

        if (user && !userError) {
          return {
            userId: stripeCustomer.user_id,
            matchMethod: 'stripe_customer_table',
            confidence: 'high',
            metadata: { createdAt: stripeCustomer.created_at }
          };
        } else {
          console.log(`[UserMatcher] 用户不存在，清理无效记录: ${stripeCustomer.user_id}`);
          await this.cleanupInvalidRecord(customerId);
        }
      }
    } catch (error) {
      console.error(`[UserMatcher] stripe_customer表查找异常:`, error);
    }

    return { userId: null, matchMethod: 'stripe_customer_table', confidence: 'low' };
  }

  /**
   * 策略2: 通过Stripe客户metadata查找
   */
  private async findByStripeMetadata(customerId: string): Promise<UserMatchResult> {
    try {
      const customer = await stripe.customers.retrieve(customerId);
      
      if (customer.deleted) {
        console.log(`[UserMatcher] Stripe客户已删除: ${customerId}`);
        return { userId: null, matchMethod: 'stripe_metadata', confidence: 'low' };
      }

      const userId = customer.metadata?.userId;
      if (!userId) {
        return { userId: null, matchMethod: 'stripe_metadata', confidence: 'low' };
      }

      // 验证用户是否存在
      const supabase = await this.supabase;
      const { data: user, error } = await supabase
        .from("user")
        .select("id, email")
        .eq("id", userId)
        .single();

      if (user && !error) {
        return {
          userId: userId,
          matchMethod: 'stripe_metadata',
          confidence: 'high',
          metadata: { customerEmail: customer.email }
        };
      } else {
        console.log(`[UserMatcher] metadata中的用户ID无效: ${userId}`);
        // 清理无效的metadata
        await stripe.customers.update(customerId, {
          metadata: {
            ...customer.metadata,
            userId: '',
            invalidUserId: userId,
            cleanedAt: new Date().toISOString()
          }
        });
      }
    } catch (error) {
      console.error(`[UserMatcher] 获取Stripe客户metadata失败:`, error);
    }

    return { userId: null, matchMethod: 'stripe_metadata', confidence: 'low' };
  }

  /**
   * 策略3: 通过邮箱匹配
   */
  private async findByEmail(customerId: string): Promise<UserMatchResult> {
    try {
      const customer = await stripe.customers.retrieve(customerId);
      
      if (customer.deleted || !customer.email) {
        return { userId: null, matchMethod: 'email_match', confidence: 'low' };
      }

      const supabase = await this.supabase;
      const { data: user, error } = await supabase
        .from("user")
        .select("id, email, created_at")
        .eq("email", customer.email)
        .single();

      if (user && !error) {
        return {
          userId: user.id,
          matchMethod: 'email_match',
          confidence: 'medium',
          metadata: { 
            customerEmail: customer.email,
            userCreatedAt: user.created_at 
          }
        };
      } else {
        console.log(`[UserMatcher] 邮箱匹配失败: ${customer.email}`, error);
      }
    } catch (error) {
      console.error(`[UserMatcher] 邮箱匹配异常:`, error);
    }

    return { userId: null, matchMethod: 'email_match', confidence: 'low' };
  }

  /**
   * 策略4: 通过名称模糊匹配
   */
  private async findByName(customerId: string): Promise<UserMatchResult> {
    try {
      const customer = await stripe.customers.retrieve(customerId);
      
      if (customer.deleted || !customer.name) {
        return { userId: null, matchMethod: 'name_match', confidence: 'low' };
      }

      const supabase = await this.supabase;
      
      // 尝试通过名称匹配（支持模糊匹配）
      const { data: users, error } = await supabase
        .from("user")
        .select("id, email, name, created_at")
        .ilike("name", `%${customer.name}%`)
        .limit(5);

      if (users && users.length > 0) {
        // 如果只有一个匹配，置信度较高
        const confidence = users.length === 1 ? 'medium' : 'low';
        
        return {
          userId: users[0].id,
          matchMethod: 'name_match',
          confidence,
          metadata: { 
            customerName: customer.name,
            matchedUser: users[0],
            totalMatches: users.length
          }
        };
      }
    } catch (error) {
      console.error(`[UserMatcher] 名称匹配异常:`, error);
    }

    return { userId: null, matchMethod: 'name_match', confidence: 'low' };
  }

  /**
   * 创建stripe_customer记录
   */
  private async createStripeCustomerRecord(userId: string, customerId: string, matchMethod: string) {
    try {
      const supabase = await this.supabase;
      
      const { error } = await supabase
        .from("stripe_customer")
        .upsert({
          id: createId(),
          user_id: userId,
          customer_id: customerId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });

      if (error) {
        console.error(`[UserMatcher] 创建stripe_customer记录失败:`, error);
        
        // 如果是唯一约束冲突，尝试更新
        if (error.code === '23505') {
          const { error: updateError } = await supabase
            .from("stripe_customer")
            .update({
              customer_id: customerId,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId);
          
          if (updateError) {
            console.error(`[UserMatcher] 更新stripe_customer记录失败:`, updateError);
          }
        }
      } else {
        console.log(`[UserMatcher] 成功创建stripe_customer记录: ${userId} -> ${customerId} (${matchMethod})`);
      }
    } catch (error) {
      console.error(`[UserMatcher] 创建stripe_customer记录异常:`, error);
    }
  }

  /**
   * 更新Stripe客户metadata
   */
  private async updateStripeCustomerMetadata(customerId: string, userId: string, matchMethod: string) {
    try {
      const customer = await stripe.customers.retrieve(customerId);
      
      if (!customer.deleted) {
        await stripe.customers.update(customerId, {
          metadata: {
            ...customer.metadata,
            userId: userId,
            linkedBy: matchMethod,
            linkedAt: new Date().toISOString(),
          }
        });
        console.log(`[UserMatcher] 已更新Stripe客户metadata: ${customerId} -> ${userId}`);
      }
    } catch (error) {
      console.error(`[UserMatcher] 更新Stripe客户metadata失败:`, error);
    }
  }

  /**
   * 清理无效记录
   */
  private async cleanupInvalidRecord(customerId: string) {
    try {
      const supabase = await this.supabase;
      
      const { error } = await supabase
        .from("stripe_customer")
        .delete()
        .eq("customer_id", customerId);

      if (error) {
        console.error(`[UserMatcher] 清理无效记录失败:`, error);
      } else {
        console.log(`[UserMatcher] 已清理无效记录: ${customerId}`);
      }
    } catch (error) {
      console.error(`[UserMatcher] 清理无效记录异常:`, error);
    }
  }

  /**
   * 记录待处理的匹配失败
   */
  async recordUnmatchedCustomer(customerId: string, context: any) {
    try {
      const supabase = await this.supabase;
      
      // 获取Stripe客户信息
      let customerInfo = null;
      try {
        const customer = await stripe.customers.retrieve(customerId);
        if (!customer.deleted) {
          customerInfo = {
            id: customer.id,
            email: customer.email,
            name: customer.name,
            metadata: customer.metadata,
            created: customer.created
          };
        }
      } catch (error) {
        console.error(`[UserMatcher] 获取客户信息失败:`, error);
      }

      // 记录到待处理表（如果存在）
      const { error } = await supabase
        .from("unmatched_stripe_customers")
        .insert({
          id: createId(),
          customer_id: customerId,
          customer_info: customerInfo,
          context: context,
          created_at: new Date().toISOString(),
          status: 'pending'
        });

      if (error && error.code !== '42P01') { // 忽略表不存在的错误
        console.error(`[UserMatcher] 记录未匹配客户失败:`, error);
      }
    } catch (error) {
      console.error(`[UserMatcher] 记录未匹配客户异常:`, error);
    }
  }
}

// 导出单例实例
export const userMatcher = new UserMatcher(); 