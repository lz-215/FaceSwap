// 数据库类型定义 - 匹配新的 auth.users + user_profiles 架构
// 使用 UUID 类型以匹配 Supabase auth.users

// auth.users 表（Supabase 管理的用户认证表）
export interface AuthUser {
  id: string; // UUID format
  email: string;
  email_confirmed_at?: string;
  phone?: string;
  created_at: string;
  updated_at: string;
  user_metadata: Record<string, any>;
  app_metadata: Record<string, any>;
}

// user_profiles 表（扩展用户信息）
export interface UserProfile {
  id: string; // UUID, references auth.users(id)
  display_name?: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string;
  customer_id?: string;
  subscription_status?: string;
  project_id?: string; // 默认值为 '0616faceswap'
  created_at: string;
  updated_at: string;
}

export interface UserCreditBalance {
  id: string; // UUID
  user_id: string; // UUID, references auth.users(id)
  balance: number;
  total_recharged: number;
  total_consumed: number;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionCredits {
  id: string; // UUID
  user_id: string; // UUID, references auth.users(id)
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
  id: string; // UUID
  user_id: string; // UUID, references auth.users(id)
  type: string;
  amount: number;
  balance_after: number;
  description?: string;
  related_subscription_id?: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface FaceSwapHistory {
  id: number; // BIGINT GENERATED ALWAYS AS IDENTITY
  user_id: string; // UUID, references auth.users(id)
  result_image_path: string;
  origin_image_url?: string;
  description?: string;
  created_at: string;
  updated_at: string;
  project_id?: string;
}

export interface StripeSubscription {
  id: string; // UUID
  user_id: string; // UUID, references auth.users(id)
  customer_id: string;
  subscription_id: string;
  product_id?: string;
  price_id?: string;
  status: string;
  current_period_start?: string;
  current_period_end?: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface PolarSubscription {
  id: string;
  subscriptionId: string;
  productId: string;
  status: string;
}

// 数据库表名常量
export const TableNames = {
  AUTH_USERS: 'auth.users', // Supabase 管理的认证表
  USER_PROFILES: 'user_profiles', // 用户扩展信息表
  USER_CREDIT_BALANCE: 'user_credit_balance',
  SUBSCRIPTION_CREDITS: 'subscription_credits',
  CREDIT_TRANSACTION: 'credit_transaction',
  FACE_SWAP_HISTORIES: 'face_swap_histories',
  STRIPE_SUBSCRIPTION: 'stripe_subscription',
} as const;

// 数据库函数返回类型
export interface GetOrCreateCreditBalanceResult {
  success: boolean;
  created: boolean;
  balance?: number;
  initialCredits?: number;
  error?: string;
}

export interface UpsertUserProfileResult {
  success: boolean;
  user_id?: string;
  error?: string;
} 