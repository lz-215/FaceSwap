-- =================================================================
-- 支付积分问题调试脚本
-- =================================================================
-- 此脚本用于诊断支付成功后积分没有增加的问题

-- 1. 检查最近的积分充值记录
SELECT 
  cr.id as recharge_id,
  cr.user_id,
  cr.amount as credits_amount,
  cr.price,
  cr.status,
  cr.payment_intent_id,
  cr.created_at,
  cr.updated_at,
  cr.metadata
FROM public.credit_recharge cr
ORDER BY cr.created_at DESC
LIMIT 10;

-- 2. 检查最近的积分交易记录
SELECT 
  ct.id as transaction_id,
  ct.user_id,
  ct.type,
  ct.amount,
  ct.balance_after,
  ct.description,
  ct.related_recharge_id,
  ct.created_at,
  ct.metadata
FROM public.credit_transaction ct
ORDER BY ct.created_at DESC
LIMIT 10;

-- 3. 检查用户积分余额
SELECT 
  ucb.id,
  ucb.user_id,
  ucb.balance,
  ucb.total_recharged,
  ucb.total_consumed,
  ucb.created_at,
  ucb.updated_at
FROM public.user_credit_balance ucb
ORDER BY ucb.updated_at DESC
LIMIT 10;

-- 4. 检查支付状态与积分记录的关联
SELECT 
  cr.id as recharge_id,
  cr.user_id,
  cr.amount as credits,
  cr.status as recharge_status,
  cr.payment_intent_id,
  cr.created_at as recharge_created,
  ct.id as transaction_id,
  ct.amount as transaction_amount,
  ct.created_at as transaction_created,
  ucb.balance as current_balance
FROM public.credit_recharge cr
LEFT JOIN public.credit_transaction ct ON cr.id = ct.related_recharge_id
LEFT JOIN public.user_credit_balance ucb ON cr.user_id = ucb.user_id
WHERE cr.created_at >= NOW() - INTERVAL '7 days'
ORDER BY cr.created_at DESC;

-- 5. 查找孤立的充值记录（有充值但没有对应交易记录）
SELECT 
  cr.id as recharge_id,
  cr.user_id,
  cr.amount,
  cr.status,
  cr.payment_intent_id,
  cr.created_at,
  'Missing transaction record' as issue
FROM public.credit_recharge cr
LEFT JOIN public.credit_transaction ct ON cr.id = ct.related_recharge_id
WHERE cr.status = 'completed' 
  AND ct.id IS NULL
  AND cr.created_at >= NOW() - INTERVAL '7 days';

-- 6. 查找状态不一致的记录
SELECT 
  cr.id as recharge_id,
  cr.user_id,
  cr.amount,
  cr.status as recharge_status,
  cr.payment_intent_id,
  cr.created_at,
  'Status should be completed but transaction missing' as issue
FROM public.credit_recharge cr
LEFT JOIN public.credit_transaction ct ON cr.id = ct.related_recharge_id
WHERE cr.payment_intent_id IS NOT NULL 
  AND cr.status = 'pending'
  AND cr.created_at < NOW() - INTERVAL '1 hour'; -- 超过1小时还是pending状态

-- 7. 检查特定用户的积分流水（替换 'YOUR_USER_ID' 为实际用户ID）
-- SELECT 
--   'Recharge' as type,
--   cr.id as record_id,
--   cr.amount,
--   cr.status,
--   cr.created_at,
--   cr.payment_intent_id
-- FROM public.credit_recharge cr
-- WHERE cr.user_id = 'YOUR_USER_ID'
-- UNION ALL
-- SELECT 
--   'Transaction' as type,
--   ct.id as record_id,
--   ct.amount,
--   ct.type as status,
--   ct.created_at,
--   (ct.metadata->>'paymentIntentId') as payment_intent_id
-- FROM public.credit_transaction ct
-- WHERE ct.user_id = 'YOUR_USER_ID'
-- ORDER BY created_at DESC;

-- 8. 检查积分套餐配置
SELECT 
  cp.id,
  cp.name,
  cp.credits,
  cp.price,
  cp.currency,
  cp.is_active,
  cp.created_at
FROM public.credit_package cp
WHERE cp.is_active = true
ORDER BY cp.sort_order, cp.price;

-- 9. 检查最近的用户注册（可能需要创建初始积分余额）
SELECT 
  u.id,
  u.email,
  u.created_at,
  ucb.balance,
  ucb.id as balance_record_id
FROM public."user" u
LEFT JOIN public.user_credit_balance ucb ON u.id = ucb.user_id
WHERE u.created_at >= NOW() - INTERVAL '7 days'
  AND ucb.id IS NULL -- 没有积分余额记录的用户
ORDER BY u.created_at DESC;

-- =================================================================
-- 修复脚本（如果发现问题可以执行）
-- =================================================================

-- 修复孤立的完成充值记录（为已完成的充值创建对应的交易记录）
/*
INSERT INTO public.credit_transaction (
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
  cr.user_id,
  'recharge',
  cr.amount,
  COALESCE(ucb.balance, 0) + cr.amount,
  '充值' || cr.amount || '积分',
  cr.id,
  jsonb_build_object(
    'paymentIntentId', cr.payment_intent_id,
    'price', cr.price,
    'currency', cr.currency,
    'rechargeId', cr.id,
    'autoFixed', true
  ),
  cr.updated_at
FROM public.credit_recharge cr
LEFT JOIN public.credit_transaction ct ON cr.id = ct.related_recharge_id
LEFT JOIN public.user_credit_balance ucb ON cr.user_id = ucb.user_id
WHERE cr.status = 'completed' 
  AND ct.id IS NULL
  AND cr.created_at >= NOW() - INTERVAL '7 days';
*/

-- 更新用户积分余额（如果发现余额不正确）
/*
WITH recharge_totals AS (
  SELECT 
    cr.user_id,
    SUM(cr.amount) as total_recharged
  FROM public.credit_recharge cr
  INNER JOIN public.credit_transaction ct ON cr.id = ct.related_recharge_id
  WHERE cr.status = 'completed'
  GROUP BY cr.user_id
),
consumption_totals AS (
  SELECT 
    ct.user_id,
    SUM(ABS(ct.amount)) as total_consumed
  FROM public.credit_transaction ct
  WHERE ct.type = 'consumption' AND ct.amount < 0
  GROUP BY ct.user_id
)
UPDATE public.user_credit_balance ucb
SET 
  balance = COALESCE(rt.total_recharged, 0) - COALESCE(ct.total_consumed, 0),
  total_recharged = COALESCE(rt.total_recharged, 0),
  total_consumed = COALESCE(ct.total_consumed, 0),
  updated_at = NOW()
FROM recharge_totals rt
FULL OUTER JOIN consumption_totals ct ON rt.user_id = ct.user_id
WHERE ucb.user_id = COALESCE(rt.user_id, ct.user_id);
*/

-- =================================================================
-- 使用说明
-- =================================================================
-- 1. 执行前面的查询来诊断问题
-- 2. 如果发现孤立的充值记录，取消注释第一个修复脚本并执行
-- 3. 如果发现余额不正确，取消注释第二个修复脚本并执行
-- 4. 执行完修复后，重新运行诊断查询验证结果 