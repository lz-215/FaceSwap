// 数据库类型定义 - 替代 Drizzle Schema
export interface User {
  id: string;
  name: string;
  email: string;
  email_verified: boolean;
  image?: string;
  first_name?: string;
  last_name?: string;
  age?: number;
  two_factor_enabled?: boolean;
  created_at: string;
  updated_at: string;
  customer_id?: string;
  subscription_status?: string;
}

export interface UserCreditBalance {
  id: string;
  user_id: string;
  balance: number;
  total_recharged: number;
  total_consumed: number;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionCredits {
  id: string;
  user_id: string;
  subscription_id: string;
  credits: number;
  remaining_credits: number;
  start_date: string;
  end_date: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface CreditTransaction {
  id: string;
  user_id: string;
  type: string;
  amount: number;
  balance_after: number;
  description?: string;
  related_subscription_id?: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface PolarSubscription {
  id: string;
  subscriptionId: string;
  productId: string;
  status: string;
  startDate?: string;
  endDate?: string;
  amount?: number;
}

// 数据库表名常量
export const TableNames = {
  USER: 'user',
  USER_CREDIT_BALANCE: 'user_credit_balance',
  SUBSCRIPTION_CREDITS: 'subscription_credits',
  CREDIT_TRANSACTION: 'credit_transaction',
} as const; 