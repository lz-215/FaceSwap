-- =================================================================
-- 支付积分问题快速修复脚本
-- =================================================================
-- 此脚本将自动应用所有必要的修复措施

\echo '开始应用支付积分修复方案...'

-- 1. 首先应用 RLS webhook 修复策略
\echo '1. 应用 RLS webhook 修复策略...'

-- 为 Stripe Webhook 创建服务角色策略
CREATE POLICY IF NOT EXISTS "Service role can manage all credit recharges" ON public.credit_recharge
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Service role can manage all credit transactions" ON public.credit_transaction
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Service role can manage all credit balances" ON public.user_credit_balance
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

\echo '   ✓ RLS 策略已应用'

-- 2. 创建 webhook 处理 RPC 函数
\echo '2. 创建 webhook 处理 RPC 函数...'

CREATE OR REPLACE FUNCTION handle_stripe_webhook_payment_success(
  p_payment_intent_id TEXT,
  p_recharge_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recharge_record credit_recharge;
  v_user_balance user_credit_balance;
  v_new_balance INTEGER;
  v_transaction_id TEXT;
  v_result JSONB;
BEGIN
  -- 查找并锁定充值记录
  SELECT * INTO v_recharge_record
  FROM credit_recharge
  WHERE id = p_recharge_id 
    AND payment_intent_id = p_payment_intent_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recharge record not found: % with payment_intent: %', p_recharge_id, p_payment_intent_id;
  END IF;

  -- 检查是否已经处理过
  IF v_recharge_record.status = 'completed' THEN
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

  -- 更新充值记录状态
  UPDATE credit_recharge
  SET 
    status = 'completed',
    updated_at = NOW()
  WHERE id = p_recharge_id;

  -- 获取或创建用户积分余额
  SELECT * INTO v_user_balance
  FROM user_credit_balance
  WHERE user_id = v_recharge_record.user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO user_credit_balance (
      id, user_id, balance, total_recharged, total_consumed, created_at, updated_at
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
    v_new_balance := v_user_balance.balance + v_recharge_record.amount;
    
    UPDATE user_credit_balance
    SET 
      balance = v_new_balance,
      total_recharged = total_recharged + v_recharge_record.amount,
      updated_at = NOW()
    WHERE user_id = v_recharge_record.user_id;
  END IF;

  -- 创建积分交易记录
  v_transaction_id := gen_random_uuid()::text;
  
  INSERT INTO credit_transaction (
    id, user_id, type, amount, balance_after, description,
    related_recharge_id, metadata, created_at
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

  RETURN jsonb_build_object(
    'success', true,
    'duplicate', false,
    'rechargeId', p_recharge_id,
    'transactionId', v_transaction_id,
    'newBalance', v_new_balance,
    'amountAdded', v_recharge_record.amount,
    'userId', v_recharge_record.user_id,
    'message', 'Payment processed successfully'
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to process payment webhook: %', SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION handle_stripe_webhook_payment_success TO service_role;
GRANT EXECUTE ON FUNCTION handle_stripe_webhook_payment_success TO authenticated;

\echo '   ✓ Webhook 处理函数已创建'

-- 3. 创建重试失败支付的函数
\echo '3. 创建重试失败支付函数...'

CREATE OR REPLACE FUNCTION retry_failed_payments()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_failed_recharge RECORD;
  v_result JSONB;
  v_results JSONB[] := '{}';
  v_count INTEGER := 0;
BEGIN
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
      AND ct.id IS NULL
    ORDER BY cr.created_at DESC
    LIMIT 10
  LOOP
    BEGIN
      v_result := handle_stripe_webhook_payment_success(
        v_failed_recharge.payment_intent_id,
        v_failed_recharge.id
      );
      
      v_results := v_results || v_result;
      v_count := v_count + 1;
      
    EXCEPTION
      WHEN OTHERS THEN
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

GRANT EXECUTE ON FUNCTION retry_failed_payments TO service_role;

\echo '   ✓ 重试函数已创建'

-- 4. 修复现有的孤立充值记录
\echo '4. 修复现有的孤立充值记录...'

WITH orphaned_recharges AS (
  SELECT 
    cr.id,
    cr.user_id,
    cr.amount,
    cr.payment_intent_id,
    cr.price,
    cr.currency,
    cr.updated_at
  FROM credit_recharge cr
  LEFT JOIN credit_transaction ct ON cr.id = ct.related_recharge_id
  WHERE cr.status = 'completed' 
    AND ct.id IS NULL
    AND cr.created_at >= NOW() - INTERVAL '7 days'
),
fixed_transactions AS (
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
  )
  SELECT 
    gen_random_uuid()::text,
    or_r.user_id,
    'recharge',
    or_r.amount,
    COALESCE(ucb.balance, 0) + or_r.amount,
    '充值' || or_r.amount || '积分 (自动修复)',
    or_r.id,
    jsonb_build_object(
      'paymentIntentId', or_r.payment_intent_id,
      'price', or_r.price,
      'currency', or_r.currency,
      'autoFixed', true,
      'fixedAt', NOW()
    ),
    or_r.updated_at
  FROM orphaned_recharges or_r
  LEFT JOIN user_credit_balance ucb ON or_r.user_id = ucb.user_id
  RETURNING user_id, amount
)
-- 更新用户积分余额
UPDATE user_credit_balance ucb
SET 
  balance = balance + ft.amount,
  total_recharged = total_recharged + ft.amount,
  updated_at = NOW()
FROM fixed_transactions ft
WHERE ucb.user_id = ft.user_id;

\echo '   ✓ 孤立充值记录已修复'

-- 5. 创建监控视图
\echo '5. 创建监控视图...'

CREATE OR REPLACE VIEW payment_credit_status AS
SELECT 
  cr.id as recharge_id,
  cr.user_id,
  cr.amount as credits,
  cr.status as recharge_status,
  cr.payment_intent_id,
  cr.created_at as payment_time,
  ct.id as transaction_id,
  ct.created_at as credit_time,
  ucb.balance as current_balance,
  CASE 
    WHEN cr.status = 'completed' AND ct.id IS NOT NULL THEN 'SUCCESS'
    WHEN cr.status = 'completed' AND ct.id IS NULL THEN 'MISSING_TRANSACTION'
    WHEN cr.status = 'pending' AND cr.created_at < NOW() - INTERVAL '1 hour' THEN 'STUCK_PENDING'
    ELSE 'PROCESSING'
  END as status_check
FROM credit_recharge cr
LEFT JOIN credit_transaction ct ON cr.id = ct.related_recharge_id
LEFT JOIN user_credit_balance ucb ON cr.user_id = ucb.user_id
WHERE cr.created_at >= NOW() - INTERVAL '7 days'
ORDER BY cr.created_at DESC;

\echo '   ✓ 监控视图已创建'

-- 6. 显示修复结果
\echo '6. 显示修复结果...'

\echo '=== 最近 24 小时的支付状态 ==='
SELECT 
  status_check,
  COUNT(*) as count
FROM payment_credit_status 
WHERE payment_time >= NOW() - INTERVAL '24 hours'
GROUP BY status_check
ORDER BY count DESC;

\echo '=== 需要关注的记录 ==='
SELECT 
  recharge_id,
  user_id,
  credits,
  status_check,
  payment_time
FROM payment_credit_status 
WHERE status_check IN ('MISSING_TRANSACTION', 'STUCK_PENDING')
ORDER BY payment_time DESC
LIMIT 10;

\echo ''
\echo '🎉 支付积分修复完成！'
\echo ''
\echo '📋 后续步骤：'
\echo '1. 检查 Stripe webhook 配置是否正确'
\echo '2. 监控新的支付是否正常处理积分'
\echo '3. 如有问题，可重新运行: SELECT retry_failed_payments();'
\echo '' 