-- =================================================================
-- 用户相关数据库函数 - 用于认证回调
-- =================================================================

-- 首先删除可能存在的旧版本函数
DROP FUNCTION IF EXISTS get_or_create_user_credit_balance(TEXT);
DROP FUNCTION IF EXISTS get_or_create_user_credit_balance;

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

-- 设置函数权限
GRANT EXECUTE ON FUNCTION get_or_create_user_credit_balance(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION get_or_create_user_credit_balance(TEXT) TO authenticated; 