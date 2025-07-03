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
}

export interface Session {
  id: string;
  user_id: string;
  token: string;
  expires_at: string;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
  updated_at: string;
}

export interface Account {
  id: string;
  user_id: string;
  provider_id: string;
  account_id: string;
  access_token?: string;
  access_token_expires_at?: string;
  refresh_token?: string;
  refresh_token_expires_at?: string;
  id_token?: string;
  scope?: string;
  password?: string;
  created_at: string;
  updated_at: string;
}

// 积分系统类型
export type CreditTransactionType = 
  | 'recharge' 
  | 'consumption' 
  | 'refund' 
  | 'bonus' 
  | 'subscription' 
  | 'expiration';

export type CreditRechargeStatus = 'pending' | 'completed' | 'failed';

export type FaceSwapStatus = 'processing' | 'completed' | 'failed';

export interface CreditPackage {
  id: string;
  name: string;
  description?: string;
  credits: number;
  price: number;
  currency: string;
  is_active: boolean;
  is_popular?: boolean;
  sort_order?: number;
  created_at: string;
  updated_at: string;
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

export interface CreditRecharge {
  id: string;
  user_id: string;
  amount: number;
  price: number;
  currency: string;
  status: CreditRechargeStatus;
  payment_method?: string;
  payment_intent_id?: string;
  created_at: string;
  updated_at: string;
}

export interface CreditTransaction {
  id: string;
  user_id: string;
  type: CreditTransactionType;
  amount: number;
  balance_after: number;
  description?: string;
  related_recharge_id?: string;
  related_upload_id?: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface CreditConsumptionConfig {
  id: string;
  action_type: string;
  credits_required: number;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// 上传和换脸相关
export interface Uploads {
  id: string;
  user_id: string;
  key: string;
  url: string;
  type: string;
  credit_consumed?: number;
  created_at: string;
  updated_at: string;
}

export interface FaceSwapHistory {
  id: string;
  user_id: string;
  origin_image_url: string;
  face_image_url: string;
  result_image_url?: string;
  status: FaceSwapStatus;
  error_message?: string;
  processing_time?: number;
  credits_consumed: number;
  metadata?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

// 支付相关
export interface StripeCustomer {
  id: string;
  user_id: string;
  customer_id: string;
  created_at: string;
  updated_at: string;
}

export interface StripeSubscription {
  id: string;
  user_id: string;
  customer_id: string;
  subscription_id: string;
  product_id: string;
  status: string;
  created_at: string;
  updated_at: string;
}

// Polar 支付相关
export interface PolarCustomer {
  id: string;
  user_id: string;
  customer_id: string;
  created_at: string;
  updated_at: string;
}

export interface PolarSubscription {
  id: string;
  user_id: string;
  customer_id: string;
  subscription_id: string;
  product_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  productId: string; // 兼容性字段
  subscriptionId: string; // 兼容性字段
}

// 数据库表名常量
export const TableNames = {
  USER: 'user',
  SESSION: 'session',
  ACCOUNT: 'account',
  VERIFICATION: 'verification',
  TWO_FACTOR: 'two_factor',
  CREDIT_PACKAGE: 'credit_package',
  USER_CREDIT_BALANCE: 'user_credit_balance',
  CREDIT_RECHARGE: 'credit_recharge',
  CREDIT_TRANSACTION: 'credit_transaction',
  CREDIT_CONSUMPTION_CONFIG: 'credit_consumption_config',
  UPLOADS: 'uploads',
  FACE_SWAP_HISTORY: 'face_swap_history',
  STRIPE_CUSTOMER: 'stripe_customer',
  STRIPE_SUBSCRIPTION: 'stripe_subscription',
  POLAR_CUSTOMER: 'polar_customer',
  POLAR_SUBSCRIPTION: 'polar_subscription',
} as const; 