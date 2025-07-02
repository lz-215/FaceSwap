-- =================================================================
-- RLS Webhook 处理修复脚本
-- =================================================================
-- 解决支付成功后积分没有增加的问题，主要针对 RLS 策略影响 webhook 处理的情况

-- 1. 为 Stripe Webhook 创建服务角色策略
-- Webhook 处理时需要绕过 RLS 限制，因为它们不在用户认证上下文中运行

-- 首先检查是否存在服务角色
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role;
  END IF;
END $$;

-- 为积分充值表添加服务角色策略
CREATE POLICY "Service role can manage all credit recharges" ON public.credit_recharge
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- 为积分交易表添加服务角色策略
CREATE POLICY "Service role can manage all credit transactions" ON public.credit_transaction
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- 为用户积分余额表添加服务角色策略
CREATE POLICY "Service role can manage all credit balances" ON public.user_credit_balance
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- 为用户表添加服务角色策略（webhook 可能需要查询用户信息）
CREATE POLICY "Service role can read all users" ON public."user"
FOR SELECT 
TO service_role 
USING (true);

-- 2. 为 webhook 处理创建 Supabase Edge Function 专用策略
-- Supabase Edge Functions 使用特殊的认证上下文

-- 允许通过 webhook 标识符访问充值记录
CREATE POLICY "Webhook can access recharges by payment intent" ON public.credit_recharge
FOR ALL 
TO authenticated
USING (
  -- 检查请求是否来自 webhook（通过特殊的请求头或上下文）
  current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  OR 
  -- 或者基于支付意图ID进行访问（更安全的方式）
  payment_intent_id IS NOT NULL
) 
WITH CHECK (
  current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  OR 
  payment_intent_id IS NOT NULL
);

-- 3. 创建专门的 RPC 函数来处理 webhook，绕过 RLS
CREATE OR REPLACE FUNCTION handle_stripe_webhook_payment_success(
  p_payment_intent_id TEXT,
  p_recharge_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- 使用定义者权限，绕过 RLS
SET search_path = public
AS $$
DECLARE
  v_recharge_record credit_recharge;
  v_user_balance user_credit_balance;
  v_new_balance INTEGER;
  v_transaction_id TEXT;
  v_result JSONB;
BEGIN
  -- 记录开始处理
  RAISE LOG 'Processing webhook for payment_intent: %, recharge: %', p_payment_intent_id, p_recharge_id;

  -- 1. 查找并锁定充值记录
  SELECT * INTO v_recharge_record
  FROM credit_recharge
  WHERE id = p_recharge_id 
    AND payment_intent_id = p_payment_intent_id
  FOR UPDATE;

  -- 检查充值记录是否存在
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recharge record not found: % with payment_intent: %', p_recharge_id, p_payment_intent_id;
  END IF;

  -- 检查是否已经处理过
  IF v_recharge_record.status = 'completed' THEN
    RAISE LOG 'Recharge already processed: %', p_recharge_id;
    
    -- 返回已处理的结果
    SELECT balance INTO v_new_balance
    FROM user_credit_balance
    WHERE user_id = v_recharge_record.user_id;
    
    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'rechargeId', p_recharge_id,
      'newBalance', COALESCE(v_new_balance, 0),
      'message', 'Already processed'
    );
  END IF;

  -- 2. 更新充值记录状态
  UPDATE credit_recharge
  SET 
    status = 'completed',
    updated_at = NOW()
  WHERE id = p_recharge_id;

  -- 3. 获取或创建用户积分余额
  SELECT * INTO v_user_balance
  FROM user_credit_balance
  WHERE user_id = v_recharge_record.user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- 创建新的积分余额记录
    INSERT INTO user_credit_balance (
      id,
      user_id,
      balance,
      total_recharged,
      total_consumed,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid()::text,
      v_recharge_record.user_id,
      v_recharge_record.amount,
      v_recharge_record.amount,
      0,
      NOW(),
      NOW()
    ) RETURNING * INTO v_user_balance;
    
    v_new_balance := v_recharge_record.amount;
  ELSE
    -- 更新现有积分余额
    v_new_balance := v_user_balance.balance + v_recharge_record.amount;
    
    UPDATE user_credit_balance
    SET 
      balance = v_new_balance,
      total_recharged = total_recharged + v_recharge_record.amount,
      updated_at = NOW()
    WHERE user_id = v_recharge_record.user_id;
  END IF;

  -- 4. 创建积分交易记录
  v_transaction_id := gen_random_uuid()::text;
  
  INSERT INTO credit_transaction (
    id,
    user_id,
    type,
    amount,
    balance_after,
    description,
    related_recharge_id,
    metadata,
    created_at
  ) VALUES (
    v_transaction_id,
    v_recharge_record.user_id,
    'recharge',
    v_recharge_record.amount,
    v_new_balance,
    '充值' || v_recharge_record.amount || '积分',
    p_recharge_id,
    jsonb_build_object(
      'paymentIntentId', p_payment_intent_id,
      'price', v_recharge_record.price,
      'currency', v_recharge_record.currency,
      'webhookProcessed', true,
      'processedAt', NOW()
    ),
    NOW()
  );

  -- 5. 返回成功结果
  v_result := jsonb_build_object(
    'success', true,
    'duplicate', false,
    'rechargeId', p_recharge_id,
    'transactionId', v_transaction_id,
    'newBalance', v_new_balance,
    'amountAdded', v_recharge_record.amount,
    'userId', v_recharge_record.user_id,
    'message', 'Payment processed successfully'
  );

  RAISE LOG 'Webhook processing completed: %', v_result;
  
  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    -- 记录错误并重新抛出
    RAISE LOG 'Error processing webhook: %', SQLERRM;
    RAISE EXCEPTION 'Failed to process payment webhook: %', SQLERRM;
END;
$$;

-- 为 RPC 函数设置权限
GRANT EXECUTE ON FUNCTION handle_stripe_webhook_payment_success TO service_role;
GRANT EXECUTE ON FUNCTION handle_stripe_webhook_payment_success TO authenticated;

-- 4. 创建重试处理失败支付的函数
CREATE OR REPLACE FUNCTION retry_failed_payments()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_failed_recharge RECORD;
  v_result JSONB;
  v_results JSONB[] := '{}';
  v_count INTEGER := 0;
BEGIN
  -- 查找需要重试的支付记录
  FOR v_failed_recharge IN
    SELECT 
      cr.id,
      cr.payment_intent_id,
      cr.user_id,
      cr.amount,
      cr.created_at
    FROM credit_recharge cr
    LEFT JOIN credit_transaction ct ON cr.id = ct.related_recharge_id
    WHERE cr.payment_intent_id IS NOT NULL
      AND cr.status = 'pending'
      AND cr.created_at < NOW() - INTERVAL '1 hour'
      AND ct.id IS NULL -- 没有对应的交易记录
    ORDER BY cr.created_at DESC
    LIMIT 10
  LOOP
    BEGIN
      -- 重试处理支付
      v_result := handle_stripe_webhook_payment_success(
        v_failed_recharge.payment_intent_id,
        v_failed_recharge.id
      );
      
      v_results := v_results || v_result;
      v_count := v_count + 1;
      
    EXCEPTION
      WHEN OTHERS THEN
        RAISE LOG 'Failed to retry payment %: %', v_failed_recharge.id, SQLERRM;
        v_results := v_results || jsonb_build_object(
          'rechargeId', v_failed_recharge.id,
          'success', false,
          'error', SQLERRM
        );
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'retriedCount', v_count,
    'results', v_results
  );
END;
$$;

-- 为重试函数设置权限
GRANT EXECUTE ON FUNCTION retry_failed_payments TO service_role;

-- 5. 创建手动修复积分的函数（用于紧急情况）
CREATE OR REPLACE FUNCTION manual_fix_user_credits(
  p_user_id TEXT,
  p_recharge_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_recharged INTEGER;
  v_total_consumed INTEGER;
  v_correct_balance INTEGER;
  v_current_balance INTEGER;
  v_balance_diff INTEGER;
  v_transaction_id TEXT;
BEGIN
  -- 计算用户应有的积分余额
  SELECT 
    COALESCE(SUM(CASE WHEN ct.type = 'recharge' THEN ct.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN ct.type = 'consumption' THEN ABS(ct.amount) ELSE 0 END), 0)
  INTO v_total_recharged, v_total_consumed
  FROM credit_transaction ct
  WHERE ct.user_id = p_user_id;

  v_correct_balance := v_total_recharged - v_total_consumed;

  -- 获取当前余额
  SELECT balance INTO v_current_balance
  FROM user_credit_balance
  WHERE user_id = p_user_id;

  v_current_balance := COALESCE(v_current_balance, 0);
  v_balance_diff := v_correct_balance - v_current_balance;

  -- 如果余额不正确，进行修复
  IF v_balance_diff != 0 THEN
    -- 更新用户积分余额
    INSERT INTO user_credit_balance (
      id, user_id, balance, total_recharged, total_consumed, created_at, updated_at
    ) VALUES (
      gen_random_uuid()::text, p_user_id, v_correct_balance, v_total_recharged, v_total_consumed, NOW(), NOW()
    ) ON CONFLICT (user_id) DO UPDATE SET
      balance = v_correct_balance,
      total_recharged = v_total_recharged,
      total_consumed = v_total_consumed,
      updated_at = NOW();

    -- 如果有余额差异，创建调整记录
    IF v_balance_diff != 0 THEN
      v_transaction_id := gen_random_uuid()::text;
      
      INSERT INTO credit_transaction (
        id, user_id, type, amount, balance_after, description, metadata, created_at
      ) VALUES (
        v_transaction_id,
        p_user_id,
        'adjustment',
        v_balance_diff,
        v_correct_balance,
        '余额调整: ' || v_balance_diff || ' 积分',
        jsonb_build_object(
          'adjustmentType', 'manual_fix',
          'previousBalance', v_current_balance,
          'rechargeId', p_recharge_id,
          'fixedAt', NOW()
        ),
        NOW()
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'userId', p_user_id,
    'previousBalance', v_current_balance,
    'correctBalance', v_correct_balance,
    'adjustment', v_balance_diff,
    'totalRecharged', v_total_recharged,
    'totalConsumed', v_total_consumed,
    'fixed', v_balance_diff != 0
  );
END;
$$;

-- 为手动修复函数设置权限
GRANT EXECUTE ON FUNCTION manual_fix_user_credits TO service_role;

-- =================================================================
-- 使用说明
-- =================================================================
-- 1. 执行此脚本以修复 RLS 相关的 webhook 处理问题
-- 2. 使用 handle_stripe_webhook_payment_success 函数来处理支付成功
-- 3. 使用 retry_failed_payments 函数来重试失败的支付
-- 4. 使用 manual_fix_user_credits 函数来手动修复用户积分 