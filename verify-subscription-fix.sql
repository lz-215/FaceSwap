-- =================================================================
-- 验证订阅Webhook修复的SQL查询
-- 用于检查用户积分、交易记录和订阅状态
-- =================================================================

-- 1. 检查特定用户的积分余额和交易记录
-- 替换 'your-user-id' 为实际的用户ID
WITH user_id_to_check AS (
  SELECT 'your-user-id'::uuid as user_id  -- 🔄 替换为实际用户ID
)
SELECT 
  '=== 用户积分余额 ===' as section,
  ucb.user_id,
  ucb.balance as current_balance,
  ucb.total_recharged,
  ucb.total_consumed,
  ucb.created_at,
  ucb.updated_at
FROM user_credit_balance ucb
CROSS JOIN user_id_to_check uid
WHERE ucb.user_id = uid.user_id

UNION ALL

SELECT 
  '=== 最近的积分交易记录 ===' as section,
  ct.user_id::text,
  ct.amount::text,
  ct.type,
  ct.description,
  ct.balance_after::text,
  ct.created_at::text
FROM credit_transaction ct
CROSS JOIN user_id_to_check uid
WHERE ct.user_id = uid.user_id
ORDER BY ct.created_at DESC
LIMIT 10;

-- 2. 检查用户的订阅状态
SELECT 
  '=== 用户订阅状态 ===' as info,
  up.id as user_id,
  up.subscription_status,
  up.customer_id,
  up.updated_at
FROM user_profiles up
WHERE up.id = 'your-user-id'::uuid;  -- 🔄 替换为实际用户ID

-- 3. 检查Stripe订阅记录
SELECT 
  '=== Stripe订阅记录 ===' as info,
  ss.id as subscription_id,
  ss.user_id,
  ss.customer_id,
  ss.status,
  ss.price_id,
  ss.start_date,
  ss.end_date,
  ss.created_at,
  ss.updated_at
FROM stripe_subscription ss
WHERE ss.user_id = 'your-user-id'::uuid  -- 🔄 替换为实际用户ID
ORDER BY ss.created_at DESC;

-- 4. 检查订阅积分记录（如果有的话）
SELECT 
  '=== 订阅积分记录 ===' as info,
  sc.id,
  sc.user_id,
  sc.subscription_id,
  sc.credits,
  sc.remaining_credits,
  sc.start_date,
  sc.end_date,
  sc.status,
  sc.created_at
FROM subscription_credits sc
WHERE sc.user_id = 'your-user-id'::uuid  -- 🔄 替换为实际用户ID
ORDER BY sc.created_at DESC;

-- 5. 检查最近的订阅相关交易
SELECT 
  '=== 订阅相关交易 ===' as info,
  ct.id,
  ct.user_id,
  ct.amount,
  ct.type,
  ct.description,
  ct.balance_after,
  ct.metadata,
  ct.created_at
FROM credit_transaction ct
WHERE ct.user_id = 'your-user-id'::uuid  -- 🔄 替换为实际用户ID
  AND (ct.type = 'bonus' OR ct.description ILIKE '%订阅%')
ORDER BY ct.created_at DESC
LIMIT 5;

-- =================================================================
-- 通用查询 - 检查系统整体状态
-- =================================================================

-- 6. 最近创建的订阅积分交易
SELECT 
  '=== 最近的订阅积分交易 ===' as info,
  ct.user_id,
  ct.amount,
  ct.description,
  ct.balance_after,
  ct.created_at,
  ct.metadata
FROM credit_transaction ct
WHERE ct.description ILIKE '%订阅%' 
  AND ct.created_at > NOW() - INTERVAL '1 hour'
ORDER BY ct.created_at DESC
LIMIT 10;

-- 7. 最近更新的用户配置
SELECT 
  '=== 最近更新的用户订阅状态 ===' as info,
  up.id as user_id,
  up.subscription_status,
  up.updated_at
FROM user_profiles up
WHERE up.updated_at > NOW() - INTERVAL '1 hour'
  AND up.subscription_status IS NOT NULL
ORDER BY up.updated_at DESC
LIMIT 10;

-- 8. 检查是否有失败的积分交易
SELECT 
  '=== 检查积分系统健康状态 ===' as info,
  COUNT(*) as total_users,
  COUNT(CASE WHEN ucb.balance >= 0 THEN 1 END) as users_with_valid_balance,
  AVG(ucb.balance) as avg_balance,
  MAX(ucb.balance) as max_balance,
  MIN(ucb.balance) as min_balance
FROM user_credit_balance ucb;

-- =================================================================
-- 使用说明
-- =================================================================

/*
使用方法：
1. 将所有 'your-user-id' 替换为实际的用户ID
2. 在Supabase SQL编辑器或psql中运行这些查询
3. 检查结果以验证修复是否成功

期望结果：
- 用户积分余额应该增加了120分（月付）或1800分（年付）
- 应该有一条类型为'bonus'的积分交易记录
- 用户的subscription_status应该为'active'
- 应该有相应的stripe_subscription记录

如果看到以上结果，说明修复成功！
*/ 