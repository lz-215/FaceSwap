-- =================================================================
-- 修复用户配置表和积分系统迁移脚本
-- 日期: 2024-12-01
-- 目的: 
-- 1. 在user_profiles表中添加email字段
-- 2. 修复积分系统函数
-- 3. 确保用户初始化时正确创建积分记录
-- =================================================================

BEGIN;

-- 1. 在user_profiles表中添加email字段（如果不存在）
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_profiles' 
        AND column_name = 'email' 
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE user_profiles ADD COLUMN email TEXT;
        CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);
    END IF;
END $$;

-- 2. 更新用户配置表，从auth.users中同步email
UPDATE user_profiles 
SET email = auth_users.email, updated_at = NOW()
FROM auth.users AS auth_users 
WHERE user_profiles.id = auth_users.id 
AND (user_profiles.email IS NULL OR user_profiles.email = '');

-- 3. 创建或替换获取用户积分的函数 (v2版本)
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

-- 4. 创建或替换消费积分的函数 (v2版本)
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
  WHERE user_credit_balance.user_id = p_user_id;

  -- 如果用户没有积分记录，先创建
  IF v_balance_record IS NULL THEN
    PERFORM get_or_create_user_credit_balance(p_user_id);
    SELECT * INTO v_balance_record
    FROM user_credit_balance
    WHERE user_credit_balance.user_id = p_user_id;
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
  WHERE user_credit_balance.user_id = p_user_id;

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

-- 5. 创建或替换充值积分的函数 (v2版本)
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
  WHERE user_credit_balance.user_id = p_user_id;

  -- 如果用户没有积分记录，先创建
  IF v_balance_record IS NULL THEN
    PERFORM get_or_create_user_credit_balance(p_user_id);
    SELECT * INTO v_balance_record
    FROM user_credit_balance
    WHERE user_credit_balance.user_id = p_user_id;
  END IF;

  -- 计算新余额
  v_new_balance := v_balance_record.balance + amount_to_add;

  -- 更新积分余额
  UPDATE user_credit_balance
  SET 
    balance = v_new_balance,
    total_recharged = total_recharged + amount_to_add,
    updated_at = NOW()
  WHERE user_credit_balance.user_id = p_user_id;

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
    CASE WHEN payment_intent_id IS NOT NULL 
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

-- 6. 创建用户profile时自动同步email的函数
CREATE OR REPLACE FUNCTION upsert_user_profile_with_email(
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
  v_user_email TEXT;
BEGIN
  -- 获取用户email
  SELECT email INTO v_user_email
  FROM auth.users
  WHERE id = p_user_id;

  -- 插入或更新用户配置
  INSERT INTO user_profiles (
    id,
    email,
    display_name,
    first_name,
    last_name,
    avatar_url,
    project_id,
    created_at,
    updated_at
  ) VALUES (
    p_user_id,
    v_user_email,
    p_display_name,
    p_first_name,
    p_last_name,
    p_avatar_url,
    p_project_id,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    display_name = COALESCE(EXCLUDED.display_name, user_profiles.display_name),
    first_name = COALESCE(EXCLUDED.first_name, user_profiles.first_name),
    last_name = COALESCE(EXCLUDED.last_name, user_profiles.last_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, user_profiles.avatar_url),
    project_id = COALESCE(EXCLUDED.project_id, user_profiles.project_id),
    updated_at = NOW()
  RETURNING * INTO v_profile_record;

  -- 确保用户有积分记录
  PERFORM get_or_create_user_credit_balance(p_user_id);

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

-- 7. 创建简化的积分查询函数（兼容旧版本）
CREATE OR REPLACE FUNCTION get_credits(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance INTEGER := 0;
BEGIN
  -- 尝试获取积分余额
  SELECT balance INTO v_balance
  FROM user_credit_balance
  WHERE user_credit_balance.user_id = p_user_id;

  -- 如果没有记录，创建初始积分
  IF v_balance IS NULL THEN
    PERFORM get_or_create_user_credit_balance(p_user_id);
    SELECT balance INTO v_balance
    FROM user_credit_balance
    WHERE user_credit_balance.user_id = p_user_id;
  END IF;

  RETURN COALESCE(v_balance, 0);

EXCEPTION
  WHEN OTHERS THEN
    RETURN 0;
END;
$$;

-- 8. 创建简化的积分消费函数（兼容旧版本）
CREATE OR REPLACE FUNCTION use_credits(p_user_id UUID, p_amount INTEGER DEFAULT 1)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance INTEGER;
  v_new_balance INTEGER;
BEGIN
  -- 获取当前积分
  SELECT balance INTO v_balance
  FROM user_credit_balance
  WHERE user_credit_balance.user_id = p_user_id;

  -- 如果没有记录，先创建
  IF v_balance IS NULL THEN
    PERFORM get_or_create_user_credit_balance(p_user_id);
    SELECT balance INTO v_balance
    FROM user_credit_balance
    WHERE user_credit_balance.user_id = p_user_id;
  END IF;

  -- 检查积分是否足够
  IF v_balance < p_amount THEN
    RETURN FALSE;
  END IF;

  -- 扣减积分
  v_new_balance := v_balance - p_amount;
  
  UPDATE user_credit_balance
  SET 
    balance = v_new_balance,
    total_consumed = total_consumed + p_amount,
    updated_at = NOW()
  WHERE user_credit_balance.user_id = p_user_id;

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
    -p_amount,
    'consumption',
    '简化积分消费',
    v_new_balance,
    NOW()
  );

  RETURN TRUE;

EXCEPTION
  WHEN OTHERS THEN
    RETURN FALSE;
END;
$$;

-- 9. 修复已存在用户的积分系统
DO $$
DECLARE
  user_record RECORD;
BEGIN
  -- 为所有没有积分记录的用户创建初始积分
  FOR user_record IN 
    SELECT au.id
    FROM auth.users au
    LEFT JOIN user_credit_balance ucb ON au.id = ucb.user_id
    WHERE ucb.user_id IS NULL
  LOOP
    PERFORM get_or_create_user_credit_balance(user_record.id);
  END LOOP;
END $$;

-- 10. 创建或更新RLS策略
DROP POLICY IF EXISTS "Users can view own credit balance" ON user_credit_balance;
CREATE POLICY "Users can view own credit balance" ON user_credit_balance
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage credit balance" ON user_credit_balance;
CREATE POLICY "Service role can manage credit balance" ON user_credit_balance
    FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users can view own transactions" ON credit_transaction;
CREATE POLICY "Users can view own transactions" ON credit_transaction
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage transactions" ON credit_transaction;
CREATE POLICY "Service role can manage transactions" ON credit_transaction
    FOR ALL USING (auth.role() = 'service_role');

COMMIT;

-- 显示完成信息
DO $$
BEGIN
  RAISE NOTICE '=================================================================';
  RAISE NOTICE '数据库修复完成！';
  RAISE NOTICE '1. ✅ user_profiles表已添加email字段';
  RAISE NOTICE '2. ✅ 积分系统函数已修复（get_user_credits_v2, consume_credits_v2等）';
  RAISE NOTICE '3. ✅ 已为现有用户初始化积分记录';
  RAISE NOTICE '4. ✅ RLS策略已更新';
  RAISE NOTICE '=================================================================';
END $$; 