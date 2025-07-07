-- =================================================================
-- 简化的数据库重建脚本 - 专为当前数据库状态设计
-- ⚠️ 警告：此脚本会删除所有现有数据！
-- =================================================================

-- 开始事务
BEGIN;

-- 显示当前状态
SELECT 'Starting database rebuild...' as status;

-- =================================================================
-- 第一步：删除所有现有表和函数（忽略错误）
-- =================================================================

-- 删除函数（忽略错误）
DROP FUNCTION IF EXISTS get_or_create_user_credit_balance CASCADE;
DROP FUNCTION IF EXISTS initialize_user_credits CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column CASCADE;
DROP FUNCTION IF EXISTS update_face_swap_history_updated_at CASCADE;
DROP FUNCTION IF EXISTS handle_subscription_payment_success CASCADE;
DROP FUNCTION IF EXISTS consume_credits CASCADE;
DROP FUNCTION IF EXISTS get_user_credits CASCADE;
DROP FUNCTION IF EXISTS add_bonus_credits_secure CASCADE;
DROP FUNCTION IF EXISTS use_credits CASCADE;
DROP FUNCTION IF EXISTS get_credits CASCADE;
DROP FUNCTION IF EXISTS upsert_user_profile CASCADE;

-- 删除所有表（按依赖顺序，忽略错误）
DROP TABLE IF EXISTS credit_transaction CASCADE;
DROP TABLE IF EXISTS face_swap_histories CASCADE;
DROP TABLE IF EXISTS subscription_credits CASCADE;
DROP TABLE IF EXISTS user_credit_balance CASCADE;
DROP TABLE IF EXISTS stripe_subscription CASCADE;
DROP TABLE IF EXISTS stripe_customer CASCADE;
DROP TABLE IF EXISTS user_profiles CASCADE;
DROP TABLE IF EXISTS "user" CASCADE;

SELECT 'Old tables and functions dropped' as status;

-- =================================================================
-- 第二步：创建新的表结构
-- =================================================================

-- 1. 创建用户配置表（扩展 auth.users）
CREATE TABLE user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT,
    first_name TEXT,
    last_name TEXT,
    avatar_url TEXT,
    customer_id TEXT UNIQUE,
    subscription_status TEXT,
    project_id TEXT DEFAULT '0616faceswap',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 创建用户积分余额表
CREATE TABLE user_credit_balance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    balance INTEGER NOT NULL DEFAULT 0,
    total_recharged INTEGER NOT NULL DEFAULT 0,
    total_consumed INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT positive_balance CHECK (balance >= 0),
    CONSTRAINT positive_recharged CHECK (total_recharged >= 0),
    CONSTRAINT positive_consumed CHECK (total_consumed >= 0)
);

-- 3. 创建积分交易记录表
CREATE TABLE credit_transaction (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    balance_after INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB,
    related_subscription_id TEXT,
    CONSTRAINT valid_balance_after CHECK (balance_after >= 0)
);

-- 4. 创建订阅积分表
CREATE TABLE subscription_credits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    subscription_id TEXT NOT NULL,
    credits INTEGER NOT NULL,
    remaining_credits INTEGER NOT NULL,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
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

-- 5. 创建人脸交换历史表
CREATE TABLE face_swap_histories (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    result_image_path TEXT NOT NULL,
    origin_image_url TEXT,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    project_id TEXT
);

-- 6. 创建Stripe订阅表
CREATE TABLE stripe_subscription (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    customer_id TEXT NOT NULL,
    subscription_id TEXT UNIQUE NOT NULL,
    product_id TEXT,
    price_id TEXT,
    status TEXT NOT NULL,
    current_period_start TIMESTAMP WITH TIME ZONE,
    current_period_end TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

SELECT 'Tables created successfully' as status;

-- =================================================================
-- 第三步：创建索引
-- =================================================================

CREATE INDEX idx_user_profiles_customer_id ON user_profiles(customer_id);
CREATE INDEX idx_user_credit_balance_user_id ON user_credit_balance(user_id);
CREATE INDEX idx_credit_transaction_user_id ON credit_transaction(user_id);
CREATE INDEX idx_credit_transaction_created_at ON credit_transaction(created_at);
CREATE INDEX idx_subscription_credits_user_id ON subscription_credits(user_id);
CREATE INDEX idx_subscription_credits_subscription_id ON subscription_credits(subscription_id);
CREATE INDEX idx_face_swap_histories_user_id ON face_swap_histories(user_id);
CREATE INDEX idx_stripe_subscription_user_id ON stripe_subscription(user_id);

SELECT 'Indexes created successfully' as status;

-- =================================================================
-- 第四步：创建函数
-- =================================================================

-- 更新时间触发器函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 获取或创建用户积分余额函数
CREATE OR REPLACE FUNCTION get_or_create_user_credit_balance(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance_record user_credit_balance;
  v_initial_amount INTEGER := 5;
BEGIN
  SELECT * INTO v_balance_record
  FROM user_credit_balance
  WHERE user_id = p_user_id;

  IF v_balance_record IS NULL THEN
    INSERT INTO user_credit_balance (
      user_id, balance, total_recharged, total_consumed
    ) VALUES (
      p_user_id, v_initial_amount, v_initial_amount, 0
    ) RETURNING * INTO v_balance_record;

    INSERT INTO credit_transaction (
      user_id, amount, type, description, balance_after
    ) VALUES (
      p_user_id, v_initial_amount, 'bonus', 'Welcome bonus', v_initial_amount
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'balance', v_balance_record.balance
  );
END;
$$;

-- 用户配置更新函数
CREATE OR REPLACE FUNCTION upsert_user_profile(
  p_user_id UUID,
  p_display_name TEXT DEFAULT NULL,
  p_first_name TEXT DEFAULT NULL,
  p_last_name TEXT DEFAULT NULL,
  p_avatar_url TEXT DEFAULT NULL,
  p_project_id TEXT DEFAULT '0616faceswap'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO user_profiles (
    id, display_name, first_name, last_name, avatar_url, project_id
  ) VALUES (
    p_user_id, p_display_name, p_first_name, p_last_name, p_avatar_url, p_project_id
  )
  ON CONFLICT (id) 
  DO UPDATE SET
    display_name = COALESCE(EXCLUDED.display_name, user_profiles.display_name),
    first_name = COALESCE(EXCLUDED.first_name, user_profiles.first_name),
    last_name = COALESCE(EXCLUDED.last_name, user_profiles.last_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, user_profiles.avatar_url),
    project_id = COALESCE(EXCLUDED.project_id, user_profiles.project_id),
    updated_at = NOW();

  RETURN jsonb_build_object('success', true, 'user_id', p_user_id);
END;
$$;

SELECT 'Functions created successfully' as status;

-- =================================================================
-- 第五步：创建触发器
-- =================================================================

CREATE TRIGGER update_user_profiles_updated_at
    BEFORE UPDATE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_credit_balance_updated_at
    BEFORE UPDATE ON user_credit_balance
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscription_credits_updated_at
    BEFORE UPDATE ON subscription_credits
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

SELECT 'Triggers created successfully' as status;

-- =================================================================
-- 第六步：启用RLS和权限
-- =================================================================

-- 启用行级安全性
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_credit_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transaction ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE face_swap_histories ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_subscription ENABLE ROW LEVEL SECURITY;

-- 创建基本策略
CREATE POLICY "Users can view own profile" ON user_profiles
    FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON user_profiles
    FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON user_profiles
    FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Service role can manage user profiles" ON user_profiles
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Users can view own credit balance" ON user_credit_balance
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role can manage credit balance" ON user_credit_balance
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Users can view own transactions" ON credit_transaction
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role can manage transactions" ON credit_transaction
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Users can view own face swap history" ON face_swap_histories
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own face swap history" ON face_swap_histories
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Service role can manage face swap histories" ON face_swap_histories
    FOR ALL USING (auth.role() = 'service_role');

-- 设置权限
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

SELECT 'RLS and permissions configured successfully' as status;

-- 提交事务
COMMIT;

-- 显示完成信息
SELECT '✅ Database rebuild completed successfully!' as result;
SELECT 'New architecture: auth.users + user_profiles + credit system' as info;
SELECT 'You can now test the authentication system.' as next_step; 