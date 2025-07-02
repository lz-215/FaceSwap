-- =================================================================
-- 支付积分问题诊断脚本
-- =================================================================
-- 用于诊断和查看当前支付积分系统的状态

-- 1. 检查最近的充值记录
SELECT 
  '最近充值记录' as section,
  cr.id as recharge_id,
  cr.user_id,
  cr.amount as credits,
  cr.status,
  cr.payment_intent_id,
  cr.created_at,
  CASE 
    WHEN ct.id IS NOT NULL THEN '有交易记录'
    ELSE '❌ 缺少交易记录'
  END as transaction_status
FROM credit_recharge cr
LEFT JOIN credit_transaction ct ON cr.id = ct.related_recharge_id
WHERE cr.created_at >= NOW() - INTERVAL '7 days'
ORDER BY cr.created_at DESC
LIMIT 20;

-- 2. 检查孤立的充值记录（支付成功但没有积分交易）
SELECT 
  '孤立充值记录' as section,
  cr.id as recharge_id,
  cr.user_id,
  cr.amount as credits,
  cr.status,
  cr.payment_intent_id,
  cr.created_at,
  '❌ 支付成功但积分未增加' as issue
FROM credit_recharge cr
LEFT JOIN credit_transaction ct ON cr.id = ct.related_recharge_id
WHERE cr.status = 'completed' 
  AND ct.id IS NULL
  AND cr.created_at >= NOW() - INTERVAL '30 days'
ORDER BY cr.created_at DESC;

-- 3. 检查用户积分余额是否正确
WITH user_transaction_summary AS (
  SELECT 
    ct.user_id,
    SUM(CASE WHEN ct.type = 'recharge' THEN ct.amount ELSE 0 END) as calculated_recharged,
    SUM(CASE WHEN ct.type = 'consumption' THEN ABS(ct.amount) ELSE 0 END) as calculated_consumed,
    (SUM(CASE WHEN ct.type = 'recharge' THEN ct.amount ELSE 0 END) - 
     SUM(CASE WHEN ct.type = 'consumption' THEN ABS(ct.amount) ELSE 0 END)) as calculated_balance
  FROM credit_transaction ct
  GROUP BY ct.user_id
)
SELECT 
  '用户积分余额检查' as section,
  ucb.user_id,
  ucb.balance as recorded_balance,
  uts.calculated_balance,
  ucb.total_recharged as recorded_recharged,
  uts.calculated_recharged,
  ucb.total_consumed as recorded_consumed,
  uts.calculated_consumed,
  CASE 
    WHEN ucb.balance = uts.calculated_balance 
     AND ucb.total_recharged = uts.calculated_recharged 
     AND ucb.total_consumed = uts.calculated_consumed THEN '✅ 正确'
    ELSE '❌ 不匹配'
  END as status
FROM user_credit_balance ucb
JOIN user_transaction_summary uts ON ucb.user_id = uts.user_id
WHERE ucb.balance != uts.calculated_balance 
   OR ucb.total_recharged != uts.calculated_recharged 
   OR ucb.total_consumed != uts.calculated_consumed
ORDER BY ucb.updated_at DESC;

-- 4. 检查webhook处理失败的记录
SELECT 
  '可能的webhook处理失败' as section,
  cr.id as recharge_id,
  cr.user_id,
  cr.amount,
  cr.status,
  cr.payment_intent_id,
  cr.created_at,
  cr.updated_at,
  EXTRACT(EPOCH FROM (NOW() - cr.created_at))/60 as minutes_since_created
FROM credit_recharge cr
WHERE cr.status = 'pending' 
  AND cr.payment_intent_id IS NOT NULL
  AND cr.created_at < NOW() - INTERVAL '10 minutes'
ORDER BY cr.created_at DESC;

-- 5. 检查RLS策略是否存在
SELECT 
  '当前RLS策略' as section,
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies 
WHERE tablename IN ('credit_recharge', 'credit_transaction', 'user_credit_balance')
  AND policyname LIKE '%service_role%'
ORDER BY tablename, policyname;

-- 6. 检查RPC函数是否存在
SELECT 
  'RPC函数状态' as section,
  routine_name,
  routine_type,
  security_type,
  CASE 
    WHEN routine_name = 'handle_stripe_webhook_payment_success' THEN '✅ 存在'
    ELSE '❌ 缺失'
  END as status
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name = 'handle_stripe_webhook_payment_success';

-- 7. 总结统计
SELECT 
  '系统状态总结' as section,
  (SELECT COUNT(*) FROM credit_recharge WHERE created_at >= NOW() - INTERVAL '7 days') as recent_recharges,
  (SELECT COUNT(*) FROM credit_recharge cr 
   LEFT JOIN credit_transaction ct ON cr.id = ct.related_recharge_id 
   WHERE cr.status = 'completed' AND ct.id IS NULL AND cr.created_at >= NOW() - INTERVAL '7 days') as orphaned_recharges,
  (SELECT COUNT(*) FROM user_credit_balance) as users_with_credits,
  (SELECT COUNT(*) FROM credit_transaction WHERE created_at >= NOW() - INTERVAL '7 days') as recent_transactions; 