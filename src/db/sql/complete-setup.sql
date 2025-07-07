-- =================================================================
-- 完整的认证系统数据库设置脚本
-- 包含所有必需的表和函数
-- =================================================================

-- 开始事务
BEGIN;

-- 1. 创建或更新用户表
CREATE TABLE IF NOT EXISTS "user" (
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
CREATE TABLE IF NOT EXISTS user_credit_balance (
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
CREATE TABLE IF NOT EXISTS credit_transaction (
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

-- 4. 创建索引
CREATE INDEX IF NOT EXISTS idx_user_email ON "user"(email);
CREATE INDEX IF NOT EXISTS idx_user_credit_balance_user_id ON user_credit_balance(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transaction_user_id ON credit_transaction(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transaction_created_at ON credit_transaction(created_at);
CREATE INDEX IF NOT EXISTS idx_credit_transaction_type ON credit_transaction(type);

-- 5. 创建更新时间触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为user表创建触发器
DROP TRIGGER IF EXISTS update_user_updated_at ON "user";
CREATE TRIGGER update_user_updated_at
    BEFORE UPDATE ON "user"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 为user_credit_balance表创建触发器
DROP TRIGGER IF EXISTS update_user_credit_balance_updated_at ON user_credit_balance;
CREATE TRIGGER update_user_credit_balance_updated_at
    BEFORE UPDATE ON user_credit_balance
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 6. 删除旧的函数版本
DROP FUNCTION IF EXISTS get_or_create_user_credit_balance(TEXT);
DROP FUNCTION IF EXISTS get_or_create_user_credit_balance;

-- 7. 创建获取或创建用户积分余额函数
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

-- 8. 设置函数权限
GRANT EXECUTE ON FUNCTION get_or_create_user_credit_balance(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION get_or_create_user_credit_balance(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_or_create_user_credit_balance(TEXT) TO anon;

-- 9. 启用行级安全性 (RLS)
ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_credit_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transaction ENABLE ROW LEVEL SECURITY;

-- 10. 创建RLS策略
-- 用户表策略
DROP POLICY IF EXISTS "Users can view own profile" ON "user";
CREATE POLICY "Users can view own profile" ON "user"
    FOR SELECT USING (auth.uid()::TEXT = id);

DROP POLICY IF EXISTS "Users can update own profile" ON "user";
CREATE POLICY "Users can update own profile" ON "user"
    FOR UPDATE USING (auth.uid()::TEXT = id);

DROP POLICY IF EXISTS "Service role can manage users" ON "user";
CREATE POLICY "Service role can manage users" ON "user"
    FOR ALL USING (auth.role() = 'service_role');

-- 积分余额表策略
DROP POLICY IF EXISTS "Users can view own credit balance" ON user_credit_balance;
CREATE POLICY "Users can view own credit balance" ON user_credit_balance
    FOR SELECT USING (auth.uid()::TEXT = user_id);

DROP POLICY IF EXISTS "Service role can manage credit balance" ON user_credit_balance;
CREATE POLICY "Service role can manage credit balance" ON user_credit_balance
    FOR ALL USING (auth.role() = 'service_role');

-- 积分交易表策略
DROP POLICY IF EXISTS "Users can view own transactions" ON credit_transaction;
CREATE POLICY "Users can view own transactions" ON credit_transaction
    FOR SELECT USING (auth.uid()::TEXT = user_id);

DROP POLICY IF EXISTS "Service role can manage transactions" ON credit_transaction;
CREATE POLICY "Service role can manage transactions" ON credit_transaction
    FOR ALL USING (auth.role() = 'service_role');

-- 提交事务
COMMIT;

-- 显示完成信息
SELECT 'Database setup completed successfully!' as result; 