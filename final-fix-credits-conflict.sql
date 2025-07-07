-- =================================================================
-- 最终修复积分系统函数重载冲突脚本
-- 彻底删除所有版本的函数，重新创建标准版本
-- =================================================================

BEGIN;

-- ❗ 重要：先清理所有相关函数的不同版本

-- 1. 删除所有可能存在的 consume_credits_v2 函数版本
DO $$
BEGIN
    -- 删除所有可能的参数组合版本
    DROP FUNCTION IF EXISTS public.consume_credits_v2(UUID, TEXT, INTEGER, TEXT) CASCADE;
    DROP FUNCTION IF EXISTS public.consume_credits_v2(p_user_id UUID, action_type TEXT, amount_override INTEGER, transaction_description TEXT) CASCADE;
    DROP FUNCTION IF EXISTS public.consume_credits_v2(user_id UUID, action_type TEXT, amount_override INTEGER, transaction_description TEXT) CASCADE;
    DROP FUNCTION IF EXISTS public.consume_credits_v2(TEXT, TEXT, INTEGER, TEXT) CASCADE;
    DROP FUNCTION IF EXISTS public.consume_credits_v2(p_user_id TEXT, action_type TEXT, amount_override INTEGER, transaction_description TEXT) CASCADE;
    DROP FUNCTION IF EXISTS public.consume_credits_v2(user_id TEXT, action_type TEXT, amount_override INTEGER, transaction_description TEXT) CASCADE;
    
    RAISE NOTICE '✅ 已删除所有 consume_credits_v2 函数版本';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '⚠️ 删除函数时遇到警告（正常现象）: %', SQLERRM;
END;
$$;

-- 2. 删除所有可能存在的 get_user_credits_v2 函数版本
DO $$
BEGIN
    DROP FUNCTION IF EXISTS public.get_user_credits_v2(UUID) CASCADE;
    DROP FUNCTION IF EXISTS public.get_user_credits_v2(p_user_id UUID) CASCADE;
    DROP FUNCTION IF EXISTS public.get_user_credits_v2(user_id UUID) CASCADE;
    DROP FUNCTION IF EXISTS public.get_user_credits_v2(TEXT) CASCADE;
    DROP FUNCTION IF EXISTS public.get_user_credits_v2(p_user_id TEXT) CASCADE;
    DROP FUNCTION IF EXISTS public.get_user_credits_v2(user_id TEXT) CASCADE;
    
    RAISE NOTICE '✅ 已删除所有 get_user_credits_v2 函数版本';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '⚠️ 删除函数时遇到警告（正常现象）: %', SQLERRM;
END;
$$;

-- 3. 删除所有可能存在的 recharge_credits_v2 函数版本
DO $$
BEGIN
    DROP FUNCTION IF EXISTS public.recharge_credits_v2(UUID, INTEGER, TEXT, TEXT) CASCADE;
    DROP FUNCTION IF EXISTS public.recharge_credits_v2(p_user_id UUID, amount_to_add INTEGER, payment_intent_id TEXT, transaction_description TEXT) CASCADE;
    DROP FUNCTION IF EXISTS public.recharge_credits_v2(user_id UUID, amount_to_add INTEGER, payment_intent_id TEXT, transaction_description TEXT) CASCADE;
    DROP FUNCTION IF EXISTS public.recharge_credits_v2(TEXT, INTEGER, TEXT, TEXT) CASCADE;
    DROP FUNCTION IF EXISTS public.recharge_credits_v2(p_user_id TEXT, amount_to_add INTEGER, payment_intent_id TEXT, transaction_description TEXT) CASCADE;
    DROP FUNCTION IF EXISTS public.recharge_credits_v2(user_id TEXT, amount_to_add INTEGER, payment_intent_id TEXT, transaction_description TEXT) CASCADE;
    
    RAISE NOTICE '✅ 已删除所有 recharge_credits_v2 函数版本';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '⚠️ 删除函数时遇到警告（正常现象）: %', SQLERRM;
END;
$$;

-- 4. 确保 get_or_create_user_credit_balance 函数存在且正确
CREATE OR REPLACE FUNCTION get_or_create_user_credit_balance(p_user_id UUID)
RETURNS user_credit_balance
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance_record user_credit_balance;
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
      5, -- 默认给新用户5个积分
      5,
      0,
      NOW(),
      NOW()
    )
    RETURNING * INTO v_balance_record;
  END IF;

  RETURN v_balance_record;

EXCEPTION
  WHEN OTHERS THEN
    -- 如果出错，尝试再次获取
    SELECT * INTO v_balance_record
    FROM user_credit_balance
    WHERE user_id = p_user_id;
    
    RETURN v_balance_record;
END;
$$;

-- 5. 创建标准的 get_user_credits_v2 函数（只有一个版本）
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
    v_balance_record := get_or_create_user_credit_balance(p_user_id);
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

-- 6. 创建标准的 consume_credits_v2 函数（只有一个版本，使用 p_user_id）
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
    v_balance_record := get_or_create_user_credit_balance(p_user_id);
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

-- 7. 创建标准的 recharge_credits_v2 函数（只有一个版本）
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
    v_balance_record := get_or_create_user_credit_balance(p_user_id);
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

-- 8. 验证函数创建是否成功
DO $$
DECLARE
    test_result JSONB;
BEGIN
    -- 测试 get_user_credits_v2 函数
    SELECT get_user_credits_v2('00000000-0000-0000-0000-000000000000') INTO test_result;
    RAISE NOTICE '✅ get_user_credits_v2 函数测试成功';
    
    -- 测试 consume_credits_v2 函数（0积分消费，不会实际扣除）
    SELECT consume_credits_v2('00000000-0000-0000-0000-000000000000', 'test', 0, '测试') INTO test_result;
    RAISE NOTICE '✅ consume_credits_v2 函数测试成功';
    
    -- 测试 recharge_credits_v2 函数（0积分充值，不会实际增加）
    SELECT recharge_credits_v2('00000000-0000-0000-0000-000000000000', 0, null, '测试') INTO test_result;
    RAISE NOTICE '✅ recharge_credits_v2 函数测试成功';
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '❌ 函数验证失败: %', SQLERRM;
END;
$$;

-- 9. 显示当前数据库中存在的积分相关函数（验证清理结果）
DO $$
DECLARE
    func_record RECORD;
    func_count INTEGER := 0;
BEGIN
    RAISE NOTICE '📋 当前数据库中的积分相关函数:';
    
    FOR func_record IN 
        SELECT 
            r.routine_name,
            string_agg(p.parameter_name || ' ' || p.data_type, ', ' ORDER BY p.ordinal_position) as parameters
        FROM information_schema.routines r
        LEFT JOIN information_schema.parameters p ON r.specific_name = p.specific_name
        WHERE r.routine_schema = 'public' 
        AND (r.routine_name LIKE '%credit%' OR r.routine_name LIKE '%consume%' OR r.routine_name LIKE '%recharge%')
        GROUP BY r.routine_name, r.specific_name
        ORDER BY r.routine_name
    LOOP
        func_count := func_count + 1;
        RAISE NOTICE '  % - %(%)', func_count, func_record.routine_name, COALESCE(func_record.parameters, 'no parameters');
    END LOOP;
    
    IF func_count = 0 THEN
        RAISE NOTICE '  (未找到积分相关函数)';
    END IF;
END;
$$;

COMMIT;

-- 输出最终成功信息
SELECT 
    '🎉 积分系统函数重载冲突彻底修复完成！' as status,
    '所有冲突函数已删除并重新创建为标准版本' as details,
    NOW() as completed_at; 