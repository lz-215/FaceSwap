-- =================================================================
-- 支付积分问题手动修复脚本
-- =================================================================
-- 立即修复支付成功后积分没有增加的问题

-- 1. 为 Stripe Webhook 创建服务角色权限策略
-- 删除可能存在的旧策略，然后创建新的
DROP POLICY IF EXISTS "Service role can manage all credit recharges" ON public.credit_recharge;
CREATE POLICY "Service role can manage all credit recharges" 
ON public.credit_recharge
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can manage all credit transactions" ON public.credit_transaction;
CREATE POLICY "Service role can manage all credit transactions" 
ON public.credit_transaction
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can manage all credit balances" ON public.user_credit_balance;
CREATE POLICY "Service role can manage all credit balances" 
ON public.user_credit_balance
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- 2. 创建 webhook 处理 RPC 函数
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
    -- 检查是否有对应的交易记录
    IF EXISTS (SELECT 1 FROM credit_transaction WHERE related_recharge_id = p_recharge_id) THEN
      SELECT balance INTO v_new_balance FROM user_credit_balance WHERE user_id = v_recharge_record.user_id;
      RETURN jsonb_build_object(
        'success', true,
        'duplicate', true,
        'newBalance', COALESCE(v_new_balance, 0),
        'message', 'Already processed'
      );
    END IF;
  ELSE
    -- 更新充值记录状态
    UPDATE credit_recharge
    SET status = 'completed', updated_at = NOW()
    WHERE id = p_recharge_id;
  END IF;

  -- 获取或创建用户积分余额
  SELECT * INTO v_user_balance
  FROM user_credit_balance
  WHERE user_id = v_recharge_record.user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- 创建新的积分余额记录
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
    -- 更新现有积分余额
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

-- 为 RPC 函数设置权限
GRANT EXECUTE ON FUNCTION handle_stripe_webhook_payment_success TO service_role;
GRANT EXECUTE ON FUNCTION handle_stripe_webhook_payment_success TO authenticated;

-- 3. 修复现有的孤立充值记录
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
    AND cr.created_at >= NOW() - INTERVAL '30 days'
)
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
  '充值' || or_r.amount || '积分 (手动修复)',
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
LEFT JOIN user_credit_balance ucb ON or_r.user_id = ucb.user_id;

-- 4. 更新用户积分余额
WITH fixed_amounts AS (
  SELECT 
    ct.user_id,
    SUM(CASE WHEN ct.type = 'recharge' THEN ct.amount ELSE 0 END) as total_recharged,
    SUM(CASE WHEN ct.type = 'consumption' THEN ABS(ct.amount) ELSE 0 END) as total_consumed
  FROM credit_transaction ct
  WHERE ct.related_recharge_id IN (
    SELECT cr.id 
    FROM credit_recharge cr
    LEFT JOIN credit_transaction ct_check ON cr.id = ct_check.related_recharge_id
    WHERE cr.status = 'completed' 
      AND cr.created_at >= NOW() - INTERVAL '30 days'
  )
  GROUP BY ct.user_id
)
UPDATE user_credit_balance ucb
SET 
  balance = fa.total_recharged - fa.total_consumed,
  total_recharged = fa.total_recharged,
  total_consumed = fa.total_consumed,
  updated_at = NOW()
FROM fixed_amounts fa
WHERE ucb.user_id = fa.user_id;

-- 5. 创建监控视图（先删除再创建）
DROP VIEW IF EXISTS payment_credit_status;
CREATE VIEW payment_credit_status AS
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
WHERE cr.created_at >= NOW() - INTERVAL '30 days'
ORDER BY cr.created_at DESC;

-- 显示修复结果
SELECT 
  '修复完成' as status,
  COUNT(*) as fixed_records
FROM credit_transaction ct
WHERE ct.metadata->>'autoFixed' = 'true'
  AND ct.created_at >= NOW() - INTERVAL '1 hour';

-- 显示当前状态
SELECT * FROM payment_credit_status WHERE status_check != 'SUCCESS' LIMIT 10; 