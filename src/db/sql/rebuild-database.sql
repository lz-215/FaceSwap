-- =================================================================
-- AIFaceSwap 数据库完全重建脚本 - 纯订阅积分系统
-- 注意：此脚本将删除现有表并重新创建，请谨慎使用！
-- =================================================================

-- 删除现有的依赖关系和表
BEGIN;

-- 1. 删除现有的函数
DROP FUNCTION IF EXISTS handle_stripe_webhook_payment_success CASCADE;
DROP FUNCTION IF EXISTS handle_subscription_payment_success CASCADE;
DROP FUNCTION IF EXISTS consume_credits CASCADE;
DROP FUNCTION IF EXISTS recharge_credits CASCADE;
DROP FUNCTION IF EXISTS get_user_credits CASCADE;
DROP FUNCTION IF EXISTS initialize_user_credits CASCADE;
DROP FUNCTION IF EXISTS add_bonus_credits_secure CASCADE;
DROP FUNCTION IF EXISTS expire_subscription_credits CASCADE;
DROP FUNCTION IF EXISTS check_and_expire_credits CASCADE;
DROP FUNCTION IF EXISTS insert_pending_subscription CASCADE;
DROP FUNCTION IF EXISTS sync_subscription CASCADE;
DROP FUNCTION IF EXISTS insert_pending_bonus_credits CASCADE;
DROP FUNCTION IF EXISTS use_credits CASCADE;
DROP FUNCTION IF EXISTS add_credits CASCADE;
DROP FUNCTION IF EXISTS get_credits CASCADE;
DROP FUNCTION IF EXISTS log_face_swap CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column CASCADE;

-- 2. 删除现有的表（按依赖关系顺序）
DROP TABLE IF EXISTS face_swap_history CASCADE;
DROP TABLE IF EXISTS credit_transaction CASCADE;
DROP TABLE IF EXISTS credit_recharge CASCADE;
DROP TABLE IF EXISTS subscription_credits CASCADE;
DROP TABLE IF EXISTS user_credit_balance CASCADE;
DROP TABLE IF EXISTS payment_records CASCADE;
DROP TABLE IF EXISTS pending_bonus_credits CASCADE;
DROP TABLE IF EXISTS user_settings CASCADE;
DROP TABLE IF EXISTS credit_package CASCADE;
DROP TABLE IF EXISTS credit_consumption_config CASCADE;
DROP TABLE IF EXISTS stripe_subscription CASCADE;
DROP TABLE IF EXISTS stripe_customer CASCADE;
DROP TABLE IF EXISTS uploads CASCADE;

-- 删除简化表
DROP TABLE IF EXISTS user_credits CASCADE;
DROP TABLE IF EXISTS credit_transactions CASCADE;
DROP TABLE IF EXISTS face_swap_logs CASCADE;

-- =================================================================
-- 创建核心表结构
-- =================================================================

-- 用户表（如果不存在）
CREATE TABLE IF NOT EXISTS "user" (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    image TEXT,
    email_verified BOOLEAN DEFAULT false,
    first_name TEXT,
    last_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 积分套餐表（仅订阅）
CREATE TABLE credit_package (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    name TEXT NOT NULL,
    credits INTEGER NOT NULL,
    price INTEGER NOT NULL, -- 价格（分）
    currency TEXT DEFAULT 'usd',
    subscription_period TEXT NOT NULL, -- 'monthly', 'yearly'
    subscription_duration_days INTEGER NOT NULL, -- 订阅期限（天）
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT positive_credits CHECK (credits > 0),
    CONSTRAINT positive_price CHECK (price > 0),
    CONSTRAINT valid_subscription_period CHECK (
        subscription_period IN ('monthly', 'yearly')
    ),
    CONSTRAINT positive_duration CHECK (subscription_duration_days > 0)
);

-- 积分消费配置表
CREATE TABLE credit_consumption_config (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    action_type TEXT NOT NULL UNIQUE,
    credits_required INTEGER NOT NULL DEFAULT 1,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT positive_credits_required CHECK (credits_required >= 0)
);

-- 用户积分余额表（仅订阅积分）
CREATE TABLE user_credit_balance (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    user_id TEXT NOT NULL UNIQUE REFERENCES "user"(id) ON DELETE CASCADE,
    balance INTEGER NOT NULL DEFAULT 0,
    total_recharged INTEGER NOT NULL DEFAULT 0,
    total_consumed INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT positive_balance CHECK (balance >= 0),
    CONSTRAINT positive_recharged CHECK (total_recharged >= 0),
    CONSTRAINT positive_consumed CHECK (total_consumed >= 0)
);

-- 订阅积分表（跟踪每个订阅期的积分）
CREATE TABLE subscription_credits (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    subscription_id TEXT NOT NULL, -- Stripe 订阅ID
    credits INTEGER NOT NULL,
    remaining_credits INTEGER NOT NULL,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    status TEXT NOT NULL DEFAULT 'active', -- 'active', 'expired', 'cancelled'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT positive_credits CHECK (credits > 0),
    CONSTRAINT positive_remaining_credits CHECK (remaining_credits >= 0),
    CONSTRAINT remaining_not_exceed_total CHECK (remaining_credits <= credits),
    CONSTRAINT valid_date_range CHECK (end_date > start_date),
    CONSTRAINT valid_subscription_status CHECK (
        status IN ('active', 'expired', 'cancelled')
    )
);

-- 积分交易记录表（简化版）
CREATE TABLE credit_transaction (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    balance_after INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB,
    related_subscription_id TEXT,
    
    CONSTRAINT valid_transaction_type CHECK (
        type IN ('subscription', 'consumption', 'expiration', 'bonus')
    ),
    CONSTRAINT valid_balance_after CHECK (balance_after >= 0)
);

-- Stripe 客户表
CREATE TABLE stripe_customer (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    user_id TEXT NOT NULL UNIQUE REFERENCES "user"(id) ON DELETE CASCADE,
    customer_id TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Stripe 订阅表
CREATE TABLE stripe_subscription (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    customer_id TEXT NOT NULL,
    subscription_id TEXT NOT NULL UNIQUE,
    product_id TEXT,
    price_id TEXT, -- Stripe Price ID
    status TEXT NOT NULL,
    current_period_start TIMESTAMP WITH TIME ZONE,
    current_period_end TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 用户配置表
CREATE TABLE user_settings (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    user_id TEXT NOT NULL UNIQUE REFERENCES "user"(id) ON DELETE CASCADE,
    language TEXT DEFAULT 'en',
    theme TEXT DEFAULT 'system',
    email_notifications BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT valid_language CHECK (language IN ('en', 'zh')),
    CONSTRAINT valid_theme CHECK (theme IN ('light', 'dark', 'system'))
);

-- 人脸交换历史记录表
CREATE TABLE face_swap_history (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    original_image TEXT,
    face_image TEXT,
    result_image TEXT,
    status TEXT NOT NULL DEFAULT 'processing',
    error_message TEXT,
    processing_time INTEGER,
    credits_used INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT valid_status CHECK (
        status IN ('processing', 'completed', 'failed', 'cancelled')
    ),
    CONSTRAINT positive_credits CHECK (credits_used >= 0)
);

-- 文件上传表
CREATE TABLE uploads (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    url TEXT NOT NULL,
    type TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 待处理积分表
CREATE TABLE pending_bonus_credits (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    description TEXT,
    metadata JSONB,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE
);

-- =================================================================
-- 创建索引
-- =================================================================

-- 用户相关索引
CREATE INDEX idx_user_email ON "user"(email);

-- 积分相关索引
CREATE INDEX idx_user_credit_balance_user_id ON user_credit_balance(user_id);
CREATE INDEX idx_subscription_credits_user_id ON subscription_credits(user_id);
CREATE INDEX idx_subscription_credits_subscription_id ON subscription_credits(subscription_id);
CREATE INDEX idx_subscription_credits_status ON subscription_credits(status);
CREATE INDEX idx_subscription_credits_end_date ON subscription_credits(end_date);
CREATE INDEX idx_credit_transaction_user_id ON credit_transaction(user_id);
CREATE INDEX idx_credit_transaction_created_at ON credit_transaction(created_at);
CREATE INDEX idx_credit_transaction_type ON credit_transaction(type);

-- Stripe 相关索引
CREATE INDEX idx_stripe_customer_user_id ON stripe_customer(user_id);
CREATE INDEX idx_stripe_customer_customer_id ON stripe_customer(customer_id);
CREATE INDEX idx_stripe_subscription_user_id ON stripe_subscription(user_id);
CREATE INDEX idx_stripe_subscription_subscription_id ON stripe_subscription(subscription_id);

-- 其他索引
CREATE INDEX idx_face_swap_history_user_id ON face_swap_history(user_id);
CREATE INDEX idx_face_swap_history_created_at ON face_swap_history(created_at);
CREATE INDEX idx_uploads_user_id ON uploads(user_id);
CREATE INDEX idx_pending_bonus_credits_user_id ON pending_bonus_credits(user_id);
CREATE INDEX idx_pending_bonus_credits_status ON pending_bonus_credits(status);

-- =================================================================
-- 创建更新时间触发器
-- =================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为需要的表添加更新时间触发器
CREATE TRIGGER update_user_updated_at
    BEFORE UPDATE ON "user"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_credit_package_updated_at
    BEFORE UPDATE ON credit_package
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_credit_consumption_config_updated_at
    BEFORE UPDATE ON credit_consumption_config
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_credit_balance_updated_at
    BEFORE UPDATE ON user_credit_balance
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscription_credits_updated_at
    BEFORE UPDATE ON subscription_credits
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stripe_customer_updated_at
    BEFORE UPDATE ON stripe_customer
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stripe_subscription_updated_at
    BEFORE UPDATE ON stripe_subscription
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_settings_updated_at
    BEFORE UPDATE ON user_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_uploads_updated_at
    BEFORE UPDATE ON uploads
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pending_bonus_credits_updated_at
    BEFORE UPDATE ON pending_bonus_credits
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =================================================================
-- 启用行级安全策略 (RLS)
-- =================================================================

ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_package ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_consumption_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_credit_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transaction ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_customer ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_subscription ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE face_swap_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_bonus_credits ENABLE ROW LEVEL SECURITY;

-- =================================================================
-- 创建 RLS 策略
-- =================================================================

-- 用户表策略
CREATE POLICY "Users can view own profile" ON "user"
    FOR SELECT USING (auth.uid()::TEXT = id);

CREATE POLICY "Users can update own profile" ON "user"
    FOR UPDATE USING (auth.uid()::TEXT = id);

-- 积分套餐策略（所有人可查看）
CREATE POLICY "Anyone can view active credit packages" ON credit_package
    FOR SELECT USING (is_active = true);

-- 积分消费配置策略（所有人可查看）
CREATE POLICY "Anyone can view active credit consumption config" ON credit_consumption_config
    FOR SELECT USING (is_active = true);

-- 用户积分余额策略
CREATE POLICY "Users can view own credit balance" ON user_credit_balance
    FOR SELECT USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Service can manage credit balance" ON user_credit_balance
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 订阅积分策略
CREATE POLICY "Users can view own subscription credits" ON subscription_credits
    FOR SELECT USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Service can manage subscription credits" ON subscription_credits
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 积分交易记录策略
CREATE POLICY "Users can view own credit transactions" ON credit_transaction
    FOR SELECT USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Service can manage credit transactions" ON credit_transaction
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Stripe 客户策略
CREATE POLICY "Users can view own stripe customer" ON stripe_customer
    FOR SELECT USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Service can manage stripe customers" ON stripe_customer
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Stripe 订阅策略
CREATE POLICY "Users can view own stripe subscriptions" ON stripe_subscription
    FOR SELECT USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Service can manage stripe subscriptions" ON stripe_subscription
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 用户设置策略
CREATE POLICY "Users can manage own settings" ON user_settings
    FOR ALL USING (auth.uid()::TEXT = user_id);

-- 人脸交换历史策略
CREATE POLICY "Users can view own face swap history" ON face_swap_history
    FOR SELECT USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Service can manage face swap history" ON face_swap_history
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 文件上传策略
CREATE POLICY "Users can manage own uploads" ON uploads
    FOR ALL USING (auth.uid()::TEXT = user_id);

-- 待处理积分策略
CREATE POLICY "Service can manage pending bonus credits" ON pending_bonus_credits
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =================================================================
-- 插入基础数据
-- =================================================================

-- 插入订阅积分套餐
INSERT INTO credit_package (name, credits, price, currency, subscription_period, subscription_duration_days, sort_order) VALUES
('月订阅套餐', 120, 1690, 'usd', 'monthly', 30, 1),
('年订阅套餐', 1800, 11880, 'usd', 'yearly', 365, 2);

-- 插入默认积分消费配置
INSERT INTO credit_consumption_config (action_type, credits_required, description) VALUES
('face_swap', 1, '人脸交换操作'),
('image_upload', 0, '图片上传'),
('image_download', 0, '图片下载');

COMMIT; 