-- =================================================================
-- 完整修复支付Webhook处理的SQL脚本
-- 解决问题：支付成功后积分分配失败
-- 创建时间：2024-12-01
-- =================================================================

BEGIN;

-- 1. 清理所有可能冲突的函数
DROP FUNCTION IF EXISTS public.handle_payment_success(TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.recharge_credits_v2(UUID, INTEGER, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.recharge_credits_v2(p_user_id UUID, amount_to_add INTEGER, payment_intent_id TEXT, transaction_description TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.get_or_create_user_credit_balance(UUID) CASCADE;

-- 2. 创建或更新get_or_create_user_credit_balance函数
CREATE OR REPLACE FUNCTION get_or_create_user_credit_balance(p_user_id UUID)
RETURNS user_credit_balance
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance_record user_credit_balance;
BEGIN
  -- 记录函数调用
  RAISE NOTICE '[get_or_create_user_credit_balance] 为用户 % 获取或创建积分记录', p_user_id;
  
  -- 尝试获取现有记录
  SELECT * INTO v_balance_record
  FROM user_credit_balance
  WHERE user_id = p_user_id;

  -- 如果没有记录，创建一个
  IF v_balance_record IS NULL THEN
    RAISE NOTICE '[get_or_create_user_credit_balance] 用户 % 没有积分记录，正在创建', p_user_id;
    
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
    
    RAISE NOTICE '[get_or_create_user_credit_balance] 已为用户 % 创建积分记录，初始余额: %', p_user_id, v_balance_record.balance;
  ELSE
    RAISE NOTICE '[get_or_create_user_credit_balance] 用户 % 已有积分记录，当前余额: %', p_user_id, v_balance_record.balance;
  END IF;

  RETURN v_balance_record;

EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE '[get_or_create_user_credit_balance] 处理用户 % 时发生错误: %', p_user_id, SQLERRM;
    
    -- 如果出错，尝试再次获取
    SELECT * INTO v_balance_record
    FROM user_credit_balance
    WHERE user_id = p_user_id;
    
    RETURN v_balance_record;
END;
$$;

-- 3. 创建统一的recharge_credits_v2函数
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
  v_transaction_id UUID;
  v_already_processed BOOLEAN := FALSE;
BEGIN
  -- 记录函数调用
  RAISE NOTICE '[recharge_credits_v2] 开始处理积分充值: user_id=%, amount=%, payment_intent_id=%', 
    p_user_id, amount_to_add, payment_intent_id;

  -- 检查是否已经处理过这个支付
  IF payment_intent_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM credit_transaction 
      WHERE metadata->>'payment_intent_id' = payment_intent_id
      AND type = 'recharge'
      AND user_id = p_user_id
    ) INTO v_already_processed;

    IF v_already_processed THEN
      RAISE NOTICE '[recharge_credits_v2] 支付已处理过: %', payment_intent_id;
      
      -- 返回已处理的结果
      SELECT balance_after INTO v_new_balance
      FROM credit_transaction 
      WHERE metadata->>'payment_intent_id' = payment_intent_id
      AND type = 'recharge'
      AND user_id = p_user_id
      LIMIT 1;
      
      RETURN jsonb_build_object(
        'success', true,
        'duplicate', true,
        'balanceAfter', v_new_balance,
        'message', '支付已处理过'
      );
    END IF;
  END IF;

  -- 获取用户当前积分
  SELECT * INTO v_balance_record
  FROM user_credit_balance
  WHERE user_id = p_user_id;

  -- 如果用户没有积分记录，先创建
  IF v_balance_record IS NULL THEN
    RAISE NOTICE '[recharge_credits_v2] 用户积分记录不存在，正在创建: %', p_user_id;
    v_balance_record := get_or_create_user_credit_balance(p_user_id);
  END IF;

  -- 计算新余额
  v_new_balance := v_balance_record.balance + amount_to_add;
  
  RAISE NOTICE '[recharge_credits_v2] 更新积分余额: % -> %', v_balance_record.balance, v_new_balance;

  -- 更新积分余额
  UPDATE user_credit_balance
  SET 
    balance = v_new_balance,
    total_recharged = total_recharged + amount_to_add,
    updated_at = NOW()
  WHERE user_id = p_user_id;

  -- 创建交易记录
  v_transaction_id := gen_random_uuid();
  
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
    v_transaction_id,
    p_user_id,
    amount_to_add,
    'recharge',
    transaction_description,
    v_new_balance,
    NOW(),
    CASE 
      WHEN payment_intent_id IS NOT NULL 
      THEN jsonb_build_object(
        'payment_intent_id', payment_intent_id,
        'processed_by', 'recharge_credits_v2',
        'processed_at', NOW()
      )
      ELSE jsonb_build_object(
        'processed_by', 'recharge_credits_v2',
        'processed_at', NOW()
      )
    END
  );

  RAISE NOTICE '[recharge_credits_v2] 充值成功: 新余额=%, 交易ID=%', v_new_balance, v_transaction_id;

  RETURN jsonb_build_object(
    'success', true,
    'balanceAfter', v_new_balance,
    'amountAdded', amount_to_add,
    'transactionId', v_transaction_id,
    'message', '积分充值成功'
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE '[recharge_credits_v2] 处理失败: %', SQLERRM;
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- 4. 创建完整的支付处理函数
CREATE OR REPLACE FUNCTION handle_payment_success(
  p_payment_intent_id TEXT,
  p_recharge_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- 记录函数调用
  RAISE NOTICE '[handle_payment_success] 开始处理支付: payment_intent_id=%, recharge_id=%', 
    p_payment_intent_id, p_recharge_id;

  -- 检查是否已经处理过这个支付
  SELECT EXISTS(
    SELECT 1 FROM credit_transaction 
    WHERE metadata->>'payment_intent_id' = p_payment_intent_id
    AND type = 'recharge'
  ) INTO v_result;

  IF v_result THEN
    RAISE NOTICE '[handle_payment_success] 支付已处理过: %', p_payment_intent_id;
    
    -- 返回已处理的结果
    SELECT jsonb_build_object(
      'success', true,
      'duplicate', true,
      'balanceAfter', balance_after,
      'message', '支付已处理过'
    ) INTO v_result
    FROM credit_transaction 
    WHERE metadata->>'payment_intent_id' = p_payment_intent_id
    AND type = 'recharge'
    LIMIT 1;
    
    RETURN v_result;
  END IF;

  -- 这个函数主要用于幂等性检查
  -- 实际的充值处理应该在webhook中使用recharge_credits_v2函数
  RETURN jsonb_build_object(
    'success', false,
    'message', '请使用备用方法处理支付'
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE '[handle_payment_success] 处理失败: %', SQLERRM;
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- 5. 创建手动修复失败支付的函数
CREATE OR REPLACE FUNCTION manual_fix_failed_payment(
  p_user_id UUID,
  p_credits_amount INTEGER,
  p_payment_intent_id TEXT,
  p_description TEXT DEFAULT '手动修复失败支付'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  RAISE NOTICE '[manual_fix_failed_payment] 手动修复支付: user_id=%, credits=%, payment_intent_id=%', 
    p_user_id, p_credits_amount, p_payment_intent_id;

  -- 调用标准充值函数
  SELECT recharge_credits_v2(
    p_user_id,
    p_credits_amount,
    p_payment_intent_id,
    p_description
  ) INTO v_result;

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE '[manual_fix_failed_payment] 手动修复失败: %', SQLERRM;
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- 6. 创建支付状态查询函数
CREATE OR REPLACE FUNCTION check_payment_status(
  p_payment_intent_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transaction_record credit_transaction;
  v_user_balance user_credit_balance;
BEGIN
  -- 查找支付相关的交易记录
  SELECT * INTO v_transaction_record
  FROM credit_transaction
  WHERE metadata->>'payment_intent_id' = p_payment_intent_id
  AND type = 'recharge'
  LIMIT 1;

  IF v_transaction_record IS NULL THEN
    RETURN jsonb_build_object(
      'processed', false,
      'message', '未找到支付记录'
    );
  END IF;

  -- 获取用户当前余额
  SELECT * INTO v_user_balance
  FROM user_credit_balance
  WHERE user_id = v_transaction_record.user_id;

  RETURN jsonb_build_object(
    'processed', true,
    'transaction_id', v_transaction_record.id,
    'user_id', v_transaction_record.user_id,
    'amount', v_transaction_record.amount,
    'balance_after', v_transaction_record.balance_after,
    'current_balance', COALESCE(v_user_balance.balance, 0),
    'processed_at', v_transaction_record.created_at,
    'description', v_transaction_record.description
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'error', SQLERRM
    );
END;
$$;

-- 7. 测试所有函数
DO $$
DECLARE
    test_result JSONB;
    test_user_id UUID := 'f4cf2a5b-bead-43af-b92b-b305f3ff778a';
    test_payment_intent_id TEXT := 'pi_test_' || gen_random_uuid();
BEGIN
    RAISE NOTICE '=== 开始测试支付处理函数 ===';

    -- 测试创建用户积分记录
    PERFORM get_or_create_user_credit_balance(test_user_id);
    RAISE NOTICE '✅ get_or_create_user_credit_balance 测试通过';

    -- 测试充值功能
    SELECT recharge_credits_v2(
        test_user_id,
        10,
        test_payment_intent_id,
        '测试充值'
    ) INTO test_result;
    
    RAISE NOTICE '✅ recharge_credits_v2 测试结果: %', test_result;
    
    -- 测试重复充值（幂等性）
    SELECT recharge_credits_v2(
        test_user_id,
        10,
        test_payment_intent_id,
        '测试重复充值'
    ) INTO test_result;
    
    RAISE NOTICE '✅ 重复充值测试结果: %', test_result;
    
    -- 测试支付状态查询
    SELECT check_payment_status(test_payment_intent_id) INTO test_result;
    RAISE NOTICE '✅ 支付状态查询结果: %', test_result;
    
    RAISE NOTICE '=== 所有测试完成 ===';

EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '❌ 测试失败: %', SQLERRM;
END;
$$;

-- 8. 创建监控视图
CREATE OR REPLACE VIEW payment_processing_monitor AS
SELECT 
    ct.id as transaction_id,
    ct.user_id,
    ct.amount,
    ct.balance_after,
    ct.created_at,
    ct.description,
    ct.metadata->>'payment_intent_id' as payment_intent_id,
    ct.metadata->>'processed_by' as processed_by,
    ucb.balance as current_balance,
    ucb.total_recharged,
    CASE 
        WHEN ct.metadata->>'payment_intent_id' IS NOT NULL THEN 'STRIPE_PAYMENT'
        ELSE 'MANUAL_RECHARGE'
    END as payment_type
FROM credit_transaction ct
LEFT JOIN user_credit_balance ucb ON ct.user_id = ucb.user_id
WHERE ct.type = 'recharge'
ORDER BY ct.created_at DESC;

COMMIT;

-- 显示完成信息
SELECT '✅ 支付Webhook完整修复完成!' as result;
SELECT '📊 使用 SELECT * FROM payment_processing_monitor LIMIT 10; 查看最近的支付记录' as monitoring_tip;
SELECT '🔧 使用 SELECT manual_fix_failed_payment(''user_id'', credits, ''payment_intent_id''); 手动修复失败支付' as manual_fix_tip;
SELECT '🔍 使用 SELECT check_payment_status(''payment_intent_id''); 查询支付状态' as status_check_tip; 