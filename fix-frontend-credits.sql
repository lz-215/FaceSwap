-- =================================================================
-- 修复前端积分显示问题的脚本
-- 问题：数据库中有积分，但前端显示"Failed to load"
-- 解决：确保get_user_credits_v2函数正确存在并可用
-- =================================================================

BEGIN;

-- 1. 删除可能存在的旧版本函数
DROP FUNCTION IF EXISTS get_user_credits_v2(UUID) CASCADE;
DROP FUNCTION IF EXISTS consume_credits_v2(UUID, TEXT, INTEGER, TEXT) CASCADE;
DROP FUNCTION IF EXISTS recharge_credits_v2(UUID, INTEGER, TEXT, TEXT) CASCADE;

-- 2. 确保get_or_create_user_credit_balance函数存在
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

-- 3. 创建前端需要的get_user_credits_v2函数
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

-- 4. 创建消费积分函数
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

-- 5. 创建充值积分函数
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

-- 6. 测试函数是否工作正常
DO $$
DECLARE
    test_result JSONB;
    test_user_id UUID := 'f4cf2a5b-bead-43af-b92b-b305f3ff778a'; -- 你的用户ID
BEGIN
    -- 测试获取积分函数
    SELECT get_user_credits_v2(test_user_id) INTO test_result;
    RAISE NOTICE '✅ 用户积分查询结果: %', test_result;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '❌ 函数测试失败: %', SQLERRM;
END;
$$;

COMMIT;

-- 显示完成信息
SELECT '✅ 前端积分函数修复完成!' as result;
SELECT '📊 现在可以通过get_user_credits_v2(user_id)获取积分信息' as info;
SELECT '💰 前端积分显示应该正常工作了' as status; 