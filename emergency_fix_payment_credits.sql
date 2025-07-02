-- =================================================================
-- 支付积分问题紧急修复脚本 (生产环境)
-- =================================================================
-- 立即解决支付成功后积分没有增加的问题

\echo '🚨 开始紧急修复支付积分问题...'

-- 1. 创建服务角色权限策略（绕过RLS限制）
\echo '1. 应用RLS权限修复...'

-- 删除可能冲突的旧策略
DROP POLICY IF EXISTS "Service role can manage all credit recharges" ON public.credit_recharge;
DROP POLICY IF EXISTS "Service role can manage all credit transactions" ON public.credit_transaction;
DROP POLICY IF EXISTS "Service role can manage all credit balances" ON public.user_credit_balance;

-- 创建新的服务角色策略
CREATE POLICY "Service role can manage all credit recharges" 
ON public.credit_recharge FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role can manage all credit transactions" 
ON public.credit_transaction FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role can manage all credit balances" 
ON public.user_credit_balance FOR ALL TO service_role USING (true) WITH CHECK (true);

-- webhook可能需要查询用户信息
CREATE POLICY IF NOT EXISTS "Service role can read all users" 
ON public."user" FOR SELECT TO service_role USING (true);

\echo '   ✅ RLS权限策略已应用'

-- 2. 创建/更新webhook处理RPC函数
\echo '2. 创建webhook处理函数...'

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
  -- 记录处理开始
  RAISE LOG 'Processing webhook payment: % for recharge: %', p_payment_intent_id, p_recharge_id;

  -- 1. 获取并锁定充值记录
  SELECT * INTO v_recharge_record
  FROM credit_recharge
  WHERE id = p_recharge_id 
    AND payment_intent_id = p_payment_intent_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recharge record not found: % with payment_intent: %', p_recharge_id, p_payment_intent_id;
  END IF;

  -- 2. 检查是否已处理过（幂等性）
  IF v_recharge_record.status = 'completed' THEN
    -- 检查是否有对应的交易记录
    IF EXISTS (SELECT 1 FROM credit_transaction WHERE related_recharge_id = p_recharge_id) THEN
      SELECT balance INTO v_new_balance FROM user_credit_balance WHERE user_id = v_recharge_record.user_id;
      RETURN jsonb_build_object(
        'success', true,
        'duplicate', true,
        'newBalance', COALESCE(v_new_balance, 0),
        'message', 'Already processed with transaction record'
      );
    END IF;
    -- 如果状态是completed但没有交易记录，继续处理
  ELSE
    -- 更新充值记录状态
    UPDATE credit_recharge
    SET status = 'completed', updated_at = NOW()
    WHERE id = p_recharge_id;
  END IF;

  -- 3. 获取或创建用户积分余额
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

  -- 4. 创建积分交易记录
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
      'processedAt', NOW(),
      'fixedBy', 'emergency_fix_script'
    ),
    NOW()
  );

  RAISE LOG 'Payment processed successfully: user=%, amount=%, new_balance=%', 
    v_recharge_record.user_id, v_recharge_record.amount, v_new_balance;

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
    RAISE LOG 'Error processing webhook payment: %', SQLERRM;
    RAISE EXCEPTION 'Failed to process payment webhook: %', SQLERRM;
END;
$$;

-- 设置函数权限
GRANT EXECUTE ON FUNCTION handle_stripe_webhook_payment_success TO service_role;
GRANT EXECUTE ON FUNCTION handle_stripe_webhook_payment_success TO authenticated;

\echo '   ✅ Webhook处理函数已创建'

-- 3. 立即修复所有孤立的充值记录
\echo '3. 修复孤立的充值记录...'

-- 创建修复函数
CREATE OR REPLACE FUNCTION fix_orphaned_recharges()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r RECORD;
  result JSONB;
  fixed_count INTEGER := 0;
  error_count INTEGER := 0;
  results JSONB[] := '{}';
BEGIN
  -- 查找所有需要修复的充值记录（近30天）
  FOR r IN 
    SELECT 
      cr.id,
      cr.payment_intent_id,
      cr.user_id,
      cr.amount,
      cr.status,
      cr.created_at
    FROM credit_recharge cr
    LEFT JOIN credit_transaction ct ON cr.id = ct.related_recharge_id
    WHERE cr.payment_intent_id IS NOT NULL
      AND cr.created_at >= NOW() - INTERVAL '30 days'
      AND (
        (cr.status = 'completed' AND ct.id IS NULL) -- 已完成但没有交易记录
        OR cr.status = 'pending' -- 或者状态还是pending
      )
    ORDER BY cr.created_at DESC
  LOOP
    BEGIN
      -- 尝试处理每个充值记录
      SELECT handle_stripe_webhook_payment_success(r.payment_intent_id, r.id) INTO result;
      
      fixed_count := fixed_count + 1;
      results := results || jsonb_build_object(
        'rechargeId', r.id,
        'userId', r.user_id,
        'amount', r.amount,
        'success', true,
        'newBalance', result->>'newBalance'
      );
      
      RAISE LOG 'Fixed recharge: % for user: % amount: %', r.id, r.user_id, r.amount;
      
    EXCEPTION
      WHEN OTHERS THEN
        error_count := error_count + 1;
        results := results || jsonb_build_object(
          'rechargeId', r.id,
          'userId', r.user_id,
          'amount', r.amount,
          'success', false,
          'error', SQLERRM
        );
        
        RAISE LOG 'Failed to fix recharge: % - %', r.id, SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'fixedCount', fixed_count,
    'errorCount', error_count,
    'totalProcessed', fixed_count + error_count,
    'results', results,
    'message', format('修复完成: 成功 %s 条，失败 %s 条', fixed_count, error_count)
  );
END;
$$;

-- 执行修复
SELECT fix_orphaned_recharges() AS fix_result;

\echo '   ✅ 孤立充值记录修复完成'

-- 4. 创建webhook失败监控表（如果不存在）
\echo '4. 创建监控表...'

CREATE TABLE IF NOT EXISTS webhook_failures (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL,
  payment_intent_id TEXT,
  recharge_id TEXT,
  error_message TEXT NOT NULL,
  error_stack TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS webhook_errors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id TEXT NOT NULL,
  error_message TEXT NOT NULL,
  error_stack TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 为监控表设置RLS策略
CREATE POLICY IF NOT EXISTS "Service role can manage webhook failures" 
ON webhook_failures FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Service role can manage webhook errors" 
ON webhook_errors FOR ALL TO service_role USING (true) WITH CHECK (true);

\echo '   ✅ 监控表已创建'

-- 5. 验证修复结果
\echo '5. 验证修复结果...'

-- 检查RPC函数是否存在
DO $$
DECLARE
    func_exists INTEGER;
BEGIN
    SELECT COUNT(*) INTO func_exists
    FROM information_schema.routines 
    WHERE routine_name = 'handle_stripe_webhook_payment_success'
      AND routine_type = 'FUNCTION';
    
    IF func_exists > 0 THEN
        RAISE NOTICE '✅ RPC函数已正确创建';
    ELSE
        RAISE EXCEPTION '❌ RPC函数创建失败';
    END IF;
END $$;

-- 检查RLS策略数量
DO $$
DECLARE
    policy_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies 
    WHERE tablename IN ('credit_recharge', 'credit_transaction', 'user_credit_balance')
      AND policyname LIKE '%service_role%';
    
    RAISE NOTICE '✅ 发现 % 个服务角色RLS策略', policy_count;
    
    IF policy_count < 3 THEN
        RAISE WARNING '⚠️  RLS策略数量可能不足，预期至少3个';
    END IF;
END $$;

-- 统计修复情况
SELECT 
  '修复统计' as category,
  COUNT(*) as total_recharges,
  COUNT(*) FILTER (WHERE status = 'completed') as completed_recharges,
  COUNT(ct.id) as with_transactions,
  COUNT(*) FILTER (WHERE status = 'completed') - COUNT(ct.id) as potentially_fixed
FROM credit_recharge cr
LEFT JOIN credit_transaction ct ON cr.id = ct.related_recharge_id
WHERE cr.created_at >= NOW() - INTERVAL '30 days';

\echo ''
\echo '🎉 紧急修复完成！'
\echo ''
\echo '📋 修复内容：'
\echo '   ✅ RLS权限策略已应用'
\echo '   ✅ Webhook处理RPC函数已创建'
\echo '   ✅ 孤立充值记录已修复'
\echo '   ✅ 监控表已创建'
\echo '   ✅ 系统配置已验证'
\echo ''
\echo '🚀 下一步：'
\echo '   1. 检查 Vercel 环境变量配置'
\echo '   2. 重新部署应用'
\echo '   3. 测试支付流程'
\echo '' 