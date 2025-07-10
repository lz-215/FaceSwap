-- =================================================================
-- 数据库修复脚本 - 解决认证登录问题
-- 确保彻底清理旧表结构并使用正确的 auth.users + user_profiles 结构
-- =================================================================

-- 开始事务
BEGIN;

-- 强制清理所有可能引用旧user表的函数和触发器
DO $$
DECLARE
    r RECORD;
BEGIN
    -- 首先删除所有触发器（避免依赖问题）
    FOR r IN (
        SELECT 'DROP TRIGGER IF EXISTS ' || trigger_name || ' ON ' || event_object_table || ' CASCADE;' as drop_stmt
        FROM information_schema.triggers 
        WHERE trigger_schema = 'public'
    ) LOOP
        EXECUTE r.drop_stmt;
    END LOOP;
    
    -- 然后删除所有可能引用user表的函数
    FOR r IN (
        SELECT 'DROP FUNCTION IF EXISTS ' || n.nspname || '.' || p.proname || 
               '(' || pg_get_function_identity_arguments(p.oid) || ') CASCADE;' as drop_stmt
        FROM pg_proc p
        LEFT JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND p.proname LIKE '%user%'
    ) LOOP
        EXECUTE r.drop_stmt;
    END LOOP;
    
    -- 删除所有可能的旧函数（包括触发器函数）
    DROP FUNCTION IF EXISTS get_or_create_user_credit_balance(UUID) CASCADE;
    DROP FUNCTION IF EXISTS get_or_create_user_credit_balance(TEXT) CASCADE;
    DROP FUNCTION IF EXISTS get_or_create_user_credit_balance() CASCADE;
    DROP FUNCTION IF EXISTS initialize_user_credits(UUID, INTEGER) CASCADE;
    DROP FUNCTION IF EXISTS initialize_user_credits(TEXT, INTEGER) CASCADE;
    DROP FUNCTION IF EXISTS initialize_user_credits(UUID) CASCADE;
    DROP FUNCTION IF EXISTS initialize_user_credits(TEXT) CASCADE;
    DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
    DROP FUNCTION IF EXISTS update_face_swap_history_updated_at() CASCADE;
    DROP FUNCTION IF EXISTS handle_subscription_payment_success(TEXT, UUID, INTEGER, TEXT, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE) CASCADE;
    DROP FUNCTION IF EXISTS handle_subscription_payment_success(TEXT, TEXT, INTEGER, TEXT, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE) CASCADE;
    DROP FUNCTION IF EXISTS consume_credits(UUID, INTEGER, TEXT) CASCADE;
    DROP FUNCTION IF EXISTS consume_credits(TEXT, INTEGER, TEXT) CASCADE;
    DROP FUNCTION IF EXISTS get_user_credits(UUID) CASCADE;
    DROP FUNCTION IF EXISTS get_user_credits(TEXT) CASCADE;
    DROP FUNCTION IF EXISTS add_bonus_credits_secure(UUID, INTEGER, TEXT, JSONB) CASCADE;
    DROP FUNCTION IF EXISTS add_bonus_credits_secure(TEXT, INTEGER, TEXT, JSONB) CASCADE;
    DROP FUNCTION IF EXISTS use_credits(UUID, INTEGER) CASCADE;
    DROP FUNCTION IF EXISTS use_credits(TEXT, INTEGER) CASCADE;
    DROP FUNCTION IF EXISTS get_credits(UUID) CASCADE;
    DROP FUNCTION IF EXISTS get_credits(TEXT) CASCADE;
    DROP FUNCTION IF EXISTS upsert_user_profile CASCADE;
    -- 删除积分相关v2函数
    DROP FUNCTION IF EXISTS get_user_credits_v2(UUID) CASCADE;
    DROP FUNCTION IF EXISTS consume_credits_v2(UUID, TEXT, INTEGER, TEXT) CASCADE;
    DROP FUNCTION IF EXISTS recharge_credits_v2(UUID, INTEGER, TEXT, TEXT) CASCADE;
END $$;

-- 删除所有表（按依赖顺序）
DROP TABLE IF EXISTS credit_transaction CASCADE;
DROP TABLE IF EXISTS face_swap_histories CASCADE;
DROP TABLE IF EXISTS subscription_credits CASCADE;
DROP TABLE IF EXISTS user_credit_balance CASCADE;
DROP TABLE IF EXISTS stripe_subscription CASCADE;
DROP TABLE IF EXISTS stripe_customer CASCADE;
DROP TABLE IF EXISTS user_profiles CASCADE;
DROP TABLE IF EXISTS "user" CASCADE;

-- =================================================================
-- 重新创建所有表和函数（使用正确的结构）
-- =================================================================

-- 1. 创建用户配置表（扩展 auth.users 的信息）
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

-- =================================================================
-- 创建索引
-- =================================================================

-- 用户配置表索引
CREATE INDEX idx_user_profiles_customer_id ON user_profiles(customer_id);

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

-- 人脸交换历史表索引
CREATE INDEX idx_face_swap_histories_user_id ON face_swap_histories(user_id);
CREATE INDEX idx_face_swap_histories_created_at ON face_swap_histories(created_at);

-- Stripe订阅表索引
CREATE INDEX idx_stripe_subscription_user_id ON stripe_subscription(user_id);
CREATE INDEX idx_stripe_subscription_customer_id ON stripe_subscription(customer_id);
CREATE INDEX idx_stripe_subscription_subscription_id ON stripe_subscription(subscription_id);

-- =================================================================
-- 创建触发器函数
-- =================================================================

-- 通用的更新时间戳函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- 创建触发器
CREATE TRIGGER update_user_profiles_updated_at
    BEFORE UPDATE ON user_profiles
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

CREATE TRIGGER update_stripe_subscription_updated_at
    BEFORE UPDATE ON stripe_subscription
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =================================================================
-- 创建关键函数（正确引用 auth.users）
-- =================================================================

-- 获取或创建用户积分余额函数
CREATE OR REPLACE FUNCTION get_or_create_user_credit_balance(p_user_id UUID)
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

  -- 如果没有记录，创建一个
  IF v_balance_record IS NULL THEN
    INSERT INTO user_credit_balance (
      user_id,
      balance,
      total_recharged,
      total_consumed,
      created_at,
      updated_at
    ) VALUES (
      p_user_id,
      v_initial_amount,
      v_initial_amount,
      0,
      NOW(),
      NOW()
    )
    RETURNING * INTO v_balance_record;

    -- 创建对应的初始积分交易记录
    INSERT INTO credit_transaction (
      user_id,
      amount,
      type,
      description,
      balance_after,
      created_at
    ) VALUES (
      p_user_id,
      v_initial_amount,
      'initial',
      '新用户初始积分',
      v_initial_amount,
      NOW()
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'balance', row_to_json(v_balance_record)
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- 用户配置管理函数
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
DECLARE
  v_profile_record user_profiles;
BEGIN
  -- 插入或更新用户配置
  INSERT INTO user_profiles (
    id,
    display_name,
    first_name,
    last_name,
    avatar_url,
    project_id,
    created_at,
    updated_at
  ) VALUES (
    p_user_id,
    p_display_name,
    p_first_name,
    p_last_name,
    p_avatar_url,
    p_project_id,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    display_name = COALESCE(EXCLUDED.display_name, user_profiles.display_name),
    first_name = COALESCE(EXCLUDED.first_name, user_profiles.first_name),
    last_name = COALESCE(EXCLUDED.last_name, user_profiles.last_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, user_profiles.avatar_url),
    project_id = COALESCE(EXCLUDED.project_id, user_profiles.project_id),
    updated_at = NOW()
  RETURNING * INTO v_profile_record;

  RETURN jsonb_build_object(
    'success', true,
    'profile', row_to_json(v_profile_record)
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- =================================================================
-- 启用RLS并创建策略
-- =================================================================

-- 启用RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_credit_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transaction ENABLE ROW LEVEL SECURITY;
ALTER TABLE face_swap_histories ENABLE ROW LEVEL SECURITY;

-- 用户配置表策略
CREATE POLICY "Users can view own profile" ON user_profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON user_profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON user_profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Service role can manage user profiles" ON user_profiles
    FOR ALL USING (auth.role() = 'service_role');

-- 积分余额表策略
CREATE POLICY "Users can view own credit balance" ON user_credit_balance
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage credit balance" ON user_credit_balance
    FOR ALL USING (auth.role() = 'service_role');

-- 积分交易表策略
CREATE POLICY "Users can view own transactions" ON credit_transaction
    FOR SELECT USING (auth.uid() = user_id);

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
-- 创建前端积分系统所需的函数
-- =================================================================

-- 获取用户积分信息的函数（前端调用）
CREATE OR REPLACE FUNCTION get_user_credits_v2(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance_record user_credit_balance;
BEGIN
  -- 获取用户积分余额
  SELECT * INTO v_balance_record
  FROM user_credit_balance
  WHERE user_id = p_user_id;

  -- 如果不存在积分记录，先创建
  IF v_balance_record IS NULL THEN
    -- 调用创建函数
    PERFORM get_or_create_user_credit_balance(p_user_id);
    
    -- 重新获取
    SELECT * INTO v_balance_record
    FROM user_credit_balance
    WHERE user_id = p_user_id;
  END IF;

  -- 返回积分信息
  RETURN jsonb_build_object(
    'balance', COALESCE(v_balance_record.balance, 0),
    'totalRecharged', COALESCE(v_balance_record.total_recharged, 0),
    'totalConsumed', COALESCE(v_balance_record.total_consumed, 0),
    'createdAt', v_balance_record.created_at,
    'updatedAt', v_balance_record.updated_at
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'balance', 0,
      'totalRecharged', 0,
      'totalConsumed', 0,
      'error', SQLERRM
    );
END;
$$;

-- 消费积分函数（前端调用）
CREATE OR REPLACE FUNCTION consume_credits_v2(
  p_user_id UUID,
  action_type TEXT DEFAULT 'face_swap',
  amount_override INTEGER DEFAULT NULL,
  transaction_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance_record user_credit_balance;
  v_amount_to_consume INTEGER := COALESCE(amount_override, 1);
  v_description TEXT := COALESCE(transaction_description, action_type || ' 操作消费积分');
  v_new_balance INTEGER;
BEGIN
  -- 获取用户当前积分
  SELECT * INTO v_balance_record
  FROM user_credit_balance
  WHERE user_id = p_user_id;

  -- 如果用户没有积分记录，先创建
  IF v_balance_record IS NULL THEN
    PERFORM get_or_create_user_credit_balance(p_user_id);
    SELECT * INTO v_balance_record
    FROM user_credit_balance
    WHERE user_id = p_user_id;
  END IF;

  -- 检查积分是否足够
  IF v_balance_record.balance < v_amount_to_consume THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', '积分不足',
      'balance', v_balance_record.balance,
      'required', v_amount_to_consume
    );
  END IF;

  -- 计算新余额
  v_new_balance := v_balance_record.balance - v_amount_to_consume;

  -- 更新积分余额
  UPDATE user_credit_balance
  SET 
    balance = v_new_balance,
    total_consumed = total_consumed + v_amount_to_consume,
    updated_at = NOW()
  WHERE user_id = p_user_id;

  -- 记录交易
  INSERT INTO credit_transaction (
    id,
    user_id,
    amount,
    type,
    description,
    balance_after,
    created_at
  ) VALUES (
    gen_random_uuid(),
    p_user_id,
    -v_amount_to_consume,
    'consumption',
    v_description,
    v_new_balance,
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'balanceAfter', v_new_balance,
    'amountConsumed', v_amount_to_consume,
    'message', '积分消费成功'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- 充值积分函数（前端调用）
CREATE OR REPLACE FUNCTION recharge_credits_v2(
  p_user_id UUID,
  amount_to_add INTEGER,
  payment_intent_id TEXT DEFAULT NULL,
  transaction_description TEXT DEFAULT '积分充值'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance_record user_credit_balance;
  v_new_balance INTEGER;
BEGIN
  -- 获取用户当前积分
  SELECT * INTO v_balance_record
  FROM user_credit_balance
  WHERE user_id = p_user_id;

  -- 如果用户没有积分记录，先创建
  IF v_balance_record IS NULL THEN
    PERFORM get_or_create_user_credit_balance(p_user_id);
    SELECT * INTO v_balance_record
    FROM user_credit_balance
    WHERE user_id = p_user_id;
  END IF;

  -- 计算新余额
  v_new_balance := v_balance_record.balance + amount_to_add;

  -- 更新积分余额
  UPDATE user_credit_balance
  SET 
    balance = v_new_balance,
    total_recharged = total_recharged + amount_to_add,
    updated_at = NOW()
  WHERE user_id = p_user_id;

  -- 记录交易
  INSERT INTO credit_transaction (
    id,
    user_id,
    amount,
    type,
    description,
    balance_after,
    created_at,
    metadata
  ) VALUES (
    gen_random_uuid(),
    p_user_id,
    amount_to_add,
    'recharge',
    transaction_description,
    v_new_balance,
    NOW(),
    CASE 
      WHEN payment_intent_id IS NOT NULL 
      THEN jsonb_build_object('payment_intent_id', payment_intent_id)
      ELSE NULL
    END
  );

  RETURN jsonb_build_object(
    'success', true,
    'balanceAfter', v_new_balance,
    'amountAdded', amount_to_add,
    'message', '积分充值成功'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- 提交事务
COMMIT;

-- 显示完成信息
SELECT 'Database fixed successfully!' as result;
SELECT 'All tables now use auth.users as the primary user table.' as info;
SELECT 'User profiles are stored in user_profiles table.' as info2;
SELECT 'All functions have been updated to use correct table references.' as info3;
SELECT 'Frontend credit functions (get_user_credits_v2, consume_credits_v2, recharge_credits_v2) are now available.' as info4; 