-- =================================================================
-- 完整的数据库清理和重建脚本
-- ⚠️ 警告：此脚本会删除所有现有数据！
-- 仅在开发环境中使用
-- =================================================================

-- 开始事务
BEGIN;

-- =================================================================
-- 第一步：删除所有现有表、函数和策略
-- =================================================================

-- 删除所有RLS策略
DROP POLICY IF EXISTS "Users can view own profile" ON "user";
DROP POLICY IF EXISTS "Users can update own profile" ON "user";
DROP POLICY IF EXISTS "Service role can manage users" ON "user";
DROP POLICY IF EXISTS "Users can view own credit balance" ON user_credit_balance;
DROP POLICY IF EXISTS "Service role can manage credit balance" ON user_credit_balance;
DROP POLICY IF EXISTS "Users can view own transactions" ON credit_transaction;
DROP POLICY IF EXISTS "Service role can manage transactions" ON credit_transaction;
DROP POLICY IF EXISTS "select_own_face_swap_history" ON face_swap_histories;
DROP POLICY IF EXISTS "insert_own_face_swap_history" ON face_swap_histories;
DROP POLICY IF EXISTS "update_own_face_swap_history" ON face_swap_histories;
DROP POLICY IF EXISTS "delete_own_face_swap_history" ON face_swap_histories;

-- 删除所有函数
DROP FUNCTION IF EXISTS get_or_create_user_credit_balance(TEXT);
DROP FUNCTION IF EXISTS get_or_create_user_credit_balance;
DROP FUNCTION IF EXISTS initialize_user_credits(TEXT, INTEGER);
DROP FUNCTION IF EXISTS initialize_user_credits(TEXT);
DROP FUNCTION IF EXISTS update_updated_at_column();
DROP FUNCTION IF EXISTS update_face_swap_history_updated_at();
DROP FUNCTION IF EXISTS handle_subscription_payment_success(TEXT, TEXT, INTEGER, TEXT, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE);
DROP FUNCTION IF EXISTS consume_credits(TEXT, INTEGER, TEXT);
DROP FUNCTION IF EXISTS get_user_credits(TEXT);
DROP FUNCTION IF EXISTS add_bonus_credits_secure(TEXT, INTEGER, TEXT, JSONB);
DROP FUNCTION IF EXISTS use_credits(TEXT, INTEGER);
DROP FUNCTION IF EXISTS get_credits(TEXT);

-- 删除所有表（按依赖顺序）
DROP TABLE IF EXISTS credit_transaction CASCADE;
DROP TABLE IF EXISTS face_swap_histories CASCADE;
DROP TABLE IF EXISTS subscription_credits CASCADE;
DROP TABLE IF EXISTS user_credit_balance CASCADE;
DROP TABLE IF EXISTS stripe_subscription CASCADE;
DROP TABLE IF EXISTS "user" CASCADE;

-- =================================================================
-- 第二步：重新创建所有表
-- =================================================================

-- 1. 创建用户表
CREATE TABLE "user" (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    image TEXT,
    email_verified BOOLEAN DEFAULT false,
    first_name TEXT,
    last_name TEXT,
    customer_id TEXT UNIQUE,
    subscription_status TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 创建用户积分余额表
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

-- 3. 创建积分交易记录表
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
    CONSTRAINT valid_balance_after CHECK (balance_after >= 0)
);

-- 4. 创建订阅积分表
CREATE TABLE subscription_credits (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
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
    user_id UUID NOT NULL REFERENCES auth.users(id),
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
    user_id TEXT NOT NULL,
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

-- =================================================================
-- 第三步：创建索引
-- =================================================================

-- 用户表索引
CREATE INDEX idx_user_email ON "user"(email);

-- 积分余额表索引
CREATE INDEX idx_user_credit_balance_user_id ON user_credit_balance(user_id);

-- 积分交易表索引
CREATE INDEX idx_credit_transaction_user_id ON credit_transaction(user_id);
CREATE INDEX idx_credit_transaction_created_at ON credit_transaction(created_at);
CREATE INDEX idx_credit_transaction_type ON credit_transaction(type);

-- 订阅积分表索引
CREATE INDEX idx_subscription_credits_user_id ON subscription_credits(user_id);
CREATE INDEX idx_subscription_credits_subscription_id ON subscription_credits(subscription_id);
CREATE INDEX idx_subscription_credits_status ON subscription_credits(status);
CREATE INDEX idx_subscription_credits_end_date ON subscription_credits(end_date);

-- Stripe订阅表索引
CREATE INDEX idx_stripe_subscription_user_id ON stripe_subscription(user_id);
CREATE INDEX idx_stripe_subscription_customer_id ON stripe_subscription(customer_id);
CREATE INDEX idx_stripe_subscription_subscription_id ON stripe_subscription(subscription_id);

-- =================================================================
-- 第四步：创建触发器函数
-- =================================================================

-- 更新时间触发器函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 人脸交换历史更新触发器函数
CREATE OR REPLACE FUNCTION update_face_swap_history_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

-- =================================================================
-- 第五步：创建触发器
-- =================================================================

-- 用户表触发器
CREATE TRIGGER update_user_updated_at
    BEFORE UPDATE ON "user"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 用户积分余额表触发器
CREATE TRIGGER update_user_credit_balance_updated_at
    BEFORE UPDATE ON user_credit_balance
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 订阅积分表触发器
CREATE TRIGGER update_subscription_credits_updated_at
    BEFORE UPDATE ON subscription_credits
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 人脸交换历史表触发器
CREATE TRIGGER update_face_swap_history_updated_at_trigger
    BEFORE UPDATE ON face_swap_histories
    FOR EACH ROW
    EXECUTE FUNCTION update_face_swap_history_updated_at();

-- Stripe订阅表触发器
CREATE TRIGGER update_stripe_subscription_updated_at
    BEFORE UPDATE ON stripe_subscription
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =================================================================
-- 第六步：创建业务函数
-- =================================================================

-- 获取或创建用户积分余额函数
CREATE OR REPLACE FUNCTION get_or_create_user_credit_balance(p_user_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance_record user_credit_balance;
  v_initial_amount INTEGER := 5; -- 新用户初始积分
BEGIN
  -- 尝试获取现有记录
  SELECT * INTO v_balance_record
  FROM user_credit_balance
  WHERE user_id = p_user_id;

  -- 如果不存在，创建新记录
  IF v_balance_record IS NULL THEN
    INSERT INTO user_credit_balance (
      id,
      user_id,
      balance,
      total_recharged,
      total_consumed,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid()::TEXT,
      p_user_id,
      v_initial_amount,
      v_initial_amount,
      0,
      NOW(),
      NOW()
    )
    RETURNING * INTO v_balance_record;

    -- 记录初始积分交易
    INSERT INTO credit_transaction (
      id,
      user_id,
      amount,
      type,
      description,
      balance_after,
      created_at
    ) VALUES (
      gen_random_uuid()::TEXT,
      p_user_id,
      v_initial_amount,
      'bonus',
      'Welcome bonus for new user',
      v_initial_amount,
      NOW()
    );

    RETURN jsonb_build_object(
      'success', true,
      'created', true,
      'balance', v_balance_record.balance,
      'initialCredits', v_initial_amount
    );
  ELSE
    RETURN jsonb_build_object(
      'success', true,
      'created', false,
      'balance', v_balance_record.balance
    );
  END IF;

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- =================================================================
-- 第七步：启用RLS并创建策略
-- =================================================================

-- 启用行级安全性
ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_credit_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transaction ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE face_swap_histories ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_subscription ENABLE ROW LEVEL SECURITY;

-- 用户表策略
CREATE POLICY "Users can view own profile" ON "user"
    FOR SELECT USING (auth.uid()::TEXT = id);

CREATE POLICY "Users can update own profile" ON "user"
    FOR UPDATE USING (auth.uid()::TEXT = id);

CREATE POLICY "Service role can manage users" ON "user"
    FOR ALL USING (auth.role() = 'service_role');

-- 积分余额表策略
CREATE POLICY "Users can view own credit balance" ON user_credit_balance
    FOR SELECT USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Service role can manage credit balance" ON user_credit_balance
    FOR ALL USING (auth.role() = 'service_role');

-- 积分交易表策略
CREATE POLICY "Users can view own transactions" ON credit_transaction
    FOR SELECT USING (auth.uid()::TEXT = user_id);

CREATE POLICY "Service role can manage transactions" ON credit_transaction
    FOR ALL USING (auth.role() = 'service_role');

-- 人脸交换历史表策略
CREATE POLICY "select_own_face_swap_history" ON face_swap_histories
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "insert_own_face_swap_history" ON face_swap_histories
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "update_own_face_swap_history" ON face_swap_histories
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "delete_own_face_swap_history" ON face_swap_histories
    FOR DELETE USING (auth.uid() = user_id);

-- =================================================================
-- 第八步：设置函数权限
-- =================================================================

-- 函数权限
GRANT EXECUTE ON FUNCTION get_or_create_user_credit_balance(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION get_or_create_user_credit_balance(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_or_create_user_credit_balance(TEXT) TO anon;

-- 表权限
GRANT ALL ON "user" TO service_role;
GRANT ALL ON user_credit_balance TO service_role;
GRANT ALL ON credit_transaction TO service_role;
GRANT ALL ON subscription_credits TO service_role;
GRANT ALL ON face_swap_histories TO service_role;
GRANT ALL ON stripe_subscription TO service_role;

-- 提交事务
COMMIT;

-- 显示完成信息
SELECT 'Database clean rebuild completed successfully!' as result;
SELECT 'All tables, functions, and policies have been recreated.' as info;
SELECT 'You can now test the authentication system.' as next_step; 