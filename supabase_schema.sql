-- 启用 pg_tle 扩展
CREATE SCHEMA IF NOT EXISTS pgtle;
CREATE EXTENSION IF NOT EXISTS "pg_tle" WITH SCHEMA "pgtle";

-- =================================================================
-- 1. 自定义枚举类型 (ENUMS)
-- =================================================================

-- 积分交易类型
CREATE TYPE public.credit_transaction_type AS ENUM (
  'recharge',
  'consumption',
  'refund',
  'bonus',
  'subscription',
  'expiration'
);

-- 积分充值状态
CREATE TYPE public.credit_recharge_status AS ENUM (
  'pending',
  'completed',
  'failed'
);

-- 人脸交换任务状态
CREATE TYPE public.face_swap_status AS ENUM (
  'processing',
  'completed',
  'failed'
);


-- =================================================================
-- 2. 认证与用户表 (Auth & Users)
-- 根据 Lucia-auth 或类似库的通用模式
-- =================================================================

-- 用户表
CREATE TABLE public."user" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  image TEXT,
  first_name TEXT,
  last_name TEXT,
  age INTEGER,
  two_factor_enabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE public."user" IS '存储用户的核心信息';
-- 启用RLS
ALTER TABLE public."user" ENABLE ROW LEVEL SECURITY;


-- 会话表
CREATE TABLE public.session (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE public.session IS '管理用户登录会话';
-- 启用RLS
ALTER TABLE public.session ENABLE ROW LEVEL SECURITY;

-- 账户表 (用于OAuth等)
CREATE TABLE public.account (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  access_token TEXT,
  access_token_expires_at TIMESTAMPTZ,
  refresh_token TEXT,
  refresh_token_expires_at TIMESTAMPTZ,
  id_token TEXT,
  scope TEXT,
  password TEXT, -- 如果使用密码提供商
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider_id, user_id)
);
COMMENT ON TABLE public.account IS '用于OAuth等第三方登录提供商';
-- 启用RLS
ALTER TABLE public.account ENABLE ROW LEVEL SECURITY;

-- 邮箱验证表
CREATE TABLE public.verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE public.verification IS '存储邮箱验证码等一次性令牌';

-- 两步验证表
CREATE TABLE public.two_factor (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  secret TEXT NOT NULL,
  backup_codes TEXT NOT NULL
);
COMMENT ON TABLE public.two_factor IS '存储两步验证的密钥和备用码';
-- 启用RLS
ALTER TABLE public.two_factor ENABLE ROW LEVEL SECURITY;


-- =================================================================
-- 3. 积分系统表 (Credits System)
-- =================================================================

-- 积分套餐表 (公开可读)
CREATE TABLE public.credit_package (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  credits INTEGER NOT NULL,
  price INTEGER NOT NULL, -- 单位: 分
  currency TEXT NOT NULL DEFAULT 'usd',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_popular BOOLEAN DEFAULT FALSE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE public.credit_package IS '定义可供购买的积分套餐';


-- 用户积分余额表
CREATE TABLE public.user_credit_balance (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES public."user"(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 0,
  total_recharged INTEGER NOT NULL DEFAULT 0,
  total_consumed INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE public.user_credit_balance IS '存储每个用户的当前积分余额';
-- 启用RLS
ALTER TABLE public.user_credit_balance ENABLE ROW LEVEL SECURITY;


-- 积分充值记录表
CREATE TABLE public.credit_recharge (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL, -- 充值积分数量
  price INTEGER NOT NULL, -- 支付金额 (分)
  currency TEXT NOT NULL DEFAULT 'usd',
  status credit_recharge_status NOT NULL,
  payment_method TEXT,
  payment_intent_id TEXT, -- Stripe 支付意图ID
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE public.credit_recharge IS '记录用户的积分充值历史';
-- 启用RLS
ALTER TABLE public.credit_recharge ENABLE ROW LEVEL SECURITY;


-- 积分交易记录表
CREATE TABLE public.credit_transaction (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  type credit_transaction_type NOT NULL,
  amount INTEGER NOT NULL, -- 正数增加, 负数减少
  balance_after INTEGER NOT NULL,
  description TEXT,
  related_recharge_id TEXT, -- 关联的充值ID
  related_upload_id TEXT, -- 关联的上传/任务ID
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE public.credit_transaction IS '所有积分变动的流水账';
-- 启用RLS
ALTER TABLE public.credit_transaction ENABLE ROW LEVEL SECURITY;


-- 积分消费配置表 (公开可读)
CREATE TABLE public.credit_consumption_config (
  id TEXT PRIMARY KEY,
  action_type TEXT NOT NULL UNIQUE, -- e.g., 'face_swap'
  credits_required INTEGER NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE public.credit_consumption_config IS '定义不同操作需要消耗的积分数';

-- =================================================================
-- 4. 文件上传与人脸交换 (Uploads & Face Swap)
-- =================================================================

-- 文件上传记录表
CREATE TABLE public.uploads (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  key TEXT NOT NULL, -- 在存储服务中的路径/key
  url TEXT NOT NULL, -- 可访问的URL
  type TEXT NOT NULL, -- 文件类型, e.g., 'image'
  credit_consumed INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE public.uploads IS '存储用户上传的所有文件信息';
-- 启用RLS
ALTER TABLE public.uploads ENABLE ROW LEVEL SECURITY;


-- 人脸交换历史记录表
CREATE TABLE public.face_swap_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  origin_image_url TEXT NOT NULL,
  face_image_url TEXT NOT NULL,
  result_image_url TEXT,
  status face_swap_status NOT NULL DEFAULT 'processing',
  error_message TEXT,
  processing_time INTEGER, -- in milliseconds
  credits_consumed INTEGER NOT NULL DEFAULT 1,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
COMMENT ON TABLE public.face_swap_history IS '记录每一次人脸交换任务';
-- 启用RLS
ALTER TABLE public.face_swap_history ENABLE ROW LEVEL SECURITY;


-- =================================================================
-- 5. 支付与订阅 (Payments & Subscriptions)
-- 以 Stripe 为例
-- =================================================================

-- Stripe 客户表
CREATE TABLE public.stripe_customer (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES public."user"(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE public.stripe_customer IS '将系统用户关联到Stripe客户';
-- 启用RLS
ALTER TABLE public.stripe_customer ENABLE ROW LEVEL SECURITY;


-- Stripe 订阅表
CREATE TABLE public.stripe_subscription (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL,
  subscription_id TEXT NOT NULL UNIQUE,
  product_id TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE public.stripe_subscription IS '管理用户的Stripe订阅状态';
-- 启用RLS
ALTER TABLE public.stripe_subscription ENABLE ROW LEVEL SECURITY;

-- =================================================================
-- 6. 自动更新 updated_at 时间戳的函数
-- =================================================================
CREATE OR REPLACE FUNCTION public.trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 为需要自动更新时间戳的表创建触发器
CREATE TRIGGER set_timestamp_user BEFORE UPDATE ON public."user" FOR EACH ROW EXECUTE PROCEDURE public.trigger_set_timestamp();
CREATE TRIGGER set_timestamp_session BEFORE UPDATE ON public.session FOR EACH ROW EXECUTE PROCEDURE public.trigger_set_timestamp();
CREATE TRIGGER set_timestamp_account BEFORE UPDATE ON public.account FOR EACH ROW EXECUTE PROCEDURE public.trigger_set_timestamp();
CREATE TRIGGER set_timestamp_verification BEFORE UPDATE ON public.verification FOR EACH ROW EXECUTE PROCEDURE public.trigger_set_timestamp();
CREATE TRIGGER set_timestamp_credit_package BEFORE UPDATE ON public.credit_package FOR EACH ROW EXECUTE PROCEDURE public.trigger_set_timestamp();
CREATE TRIGGER set_timestamp_user_credit_balance BEFORE UPDATE ON public.user_credit_balance FOR EACH ROW EXECUTE PROCEDURE public.trigger_set_timestamp();
CREATE TRIGGER set_timestamp_credit_recharge BEFORE UPDATE ON public.credit_recharge FOR EACH ROW EXECUTE PROCEDURE public.trigger_set_timestamp();
CREATE TRIGGER set_timestamp_credit_consumption_config BEFORE UPDATE ON public.credit_consumption_config FOR EACH ROW EXECUTE PROCEDURE public.trigger_set_timestamp();
CREATE TRIGGER set_timestamp_uploads BEFORE UPDATE ON public.uploads FOR EACH ROW EXECUTE PROCEDURE public.trigger_set_timestamp();
CREATE TRIGGER set_timestamp_face_swap_history BEFORE UPDATE ON public.face_swap_history FOR EACH ROW EXECUTE PROCEDURE public.trigger_set_timestamp();
CREATE TRIGGER set_timestamp_stripe_customer BEFORE UPDATE ON public.stripe_customer FOR EACH ROW EXECUTE PROCEDURE public.trigger_set_timestamp();
CREATE TRIGGER set_timestamp_stripe_subscription BEFORE UPDATE ON public.stripe_subscription FOR EACH ROW EXECUTE PROCEDURE public.trigger_set_timestamp();

-- =================================================================
-- 提示: 接下来您应该为启用了RLS的表创建安全策略 (Policies)
-- 例如: 用户只能看到自己的数据
-- CREATE POLICY "User can see their own data" ON public.face_swap_history
-- FOR SELECT USING (auth.uid() = user_id);
-- ================================================================= 