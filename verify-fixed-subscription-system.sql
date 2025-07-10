-- =================================================================
-- 验证修复后订阅系统的SQL查询脚本
-- 修正了类型匹配问题并增加了全面的检查功能
-- =================================================================

-- 1. 检查特定用户的积分余额和交易记录
-- 替换 'your-user-id' 为实际的用户ID
WITH user_id_to_check AS (
  SELECT 'your-user-id'::uuid as user_id  -- 🔄 替换为实际用户ID
)
SELECT 
  '=== 用户积分余额 ===' as section,
  ucb.user_id::text,
  ucb.balance::text as current_balance,
  ucb.total_recharged::text,
  ucb.total_consumed::text,
  ucb.created_at::text,
  ucb.updated_at::text
FROM user_credit_balance ucb
CROSS JOIN user_id_to_check uid
WHERE ucb.user_id = uid.user_id

UNION ALL

SELECT 
  '=== 最近的积分交易记录 ===' as section,
  recent_transactions.user_id::text,
  recent_transactions.amount::text,
  recent_transactions.type,
  recent_transactions.description,
  recent_transactions.balance_after::text,
  recent_transactions.created_at::text
FROM (
  SELECT 
    ct.user_id,
    ct.amount,
    ct.type,
    ct.description,
    ct.balance_after,
    ct.created_at
  FROM credit_transaction ct
  WHERE ct.user_id = (SELECT user_id FROM user_id_to_check)
  ORDER BY ct.created_at DESC
  LIMIT 10
) recent_transactions

UNION ALL

SELECT 
  '=== 订阅积分详情 ===' as section,
  subscription_details.user_id::text,
  subscription_details.credits::text,
  subscription_details.subscription_id,
  subscription_details.status,
  subscription_details.remaining_credits::text,
  subscription_details.expiry_info
FROM (
  SELECT 
    sc.user_id,
    sc.credits,
    sc.subscription_id,
    sc.status,
    sc.remaining_credits,
    CASE 
      WHEN sc.end_date > NOW() THEN 
        CONCAT(ROUND(EXTRACT(EPOCH FROM (sc.end_date - NOW())) / 86400, 1), ' 天后过期')
      ELSE '已过期'
    END as expiry_info
  FROM subscription_credits sc
  WHERE sc.user_id = (SELECT user_id FROM user_id_to_check)
  ORDER BY sc.end_date DESC
) subscription_details;

-- 2. 检查Stripe订阅记录
SELECT 
  '=== Stripe订阅记录 ===' as info,
  ss.subscription_id,
  ss.user_id::text,
  ss.customer_id,
  ss.status,
  ss.price_id,
  ss.current_period_start::text,
  ss.current_period_end::text,
  ss.created_at::text,
  ss.updated_at::text
FROM stripe_subscription ss
WHERE ss.user_id = 'your-user-id'::uuid  -- 🔄 替换为实际用户ID
ORDER BY ss.created_at DESC;

-- 3. 系统整体健康检查
SELECT 
  '=== 系统统计 ===' as section,
  '用户总数' as metric,
  COUNT(*)::text as value,
  '' as detail,
  '' as status,
  '' as recommendation,
  NOW()::text as checked_at
FROM auth.users

UNION ALL

SELECT 
  '=== 系统统计 ===' as section,
  '有积分余额的用户' as metric,
  COUNT(*)::text as value,
  CONCAT('平均余额: ', ROUND(AVG(balance), 2)) as detail,
  CASE WHEN COUNT(*) > 0 THEN '正常' ELSE '异常' END as status,
  CASE WHEN COUNT(*) = 0 THEN '检查积分系统配置' ELSE '' END as recommendation,
  NOW()::text as checked_at
FROM user_credit_balance
WHERE balance > 0

UNION ALL

SELECT 
  '=== 系统统计 ===' as section,
  '活跃订阅积分' as metric,
  COUNT(*)::text as value,
  CONCAT('总积分: ', COALESCE(SUM(remaining_credits), 0)) as detail,
  CASE WHEN COUNT(*) > 0 THEN '正常' ELSE '需要检查' END as status,
  CASE WHEN COUNT(*) = 0 THEN '检查订阅webhook是否正常工作' ELSE '' END as recommendation,
  NOW()::text as checked_at
FROM subscription_credits 
WHERE status = 'active' AND end_date > NOW()

UNION ALL

SELECT 
  '=== 系统统计 ===' as section,
  '过期订阅积分' as metric,
  COUNT(*)::text as value,
  CONCAT('过期总积分: ', COALESCE(SUM(credits - remaining_credits), 0)) as detail,
  '信息' as status,
  '可定期清理过期记录' as recommendation,
  NOW()::text as checked_at
FROM subscription_credits 
WHERE status = 'expired'

UNION ALL

SELECT 
  '=== 系统统计 ===' as section,
  '今日交易记录' as metric,
  COUNT(*)::text as value,
  CONCAT('总交易金额: ', COALESCE(SUM(amount), 0)) as detail,
  CASE WHEN COUNT(*) > 0 THEN '正常' ELSE '无交易' END as status,
  '' as recommendation,
  NOW()::text as checked_at
FROM credit_transaction 
WHERE created_at >= CURRENT_DATE

UNION ALL

SELECT 
  '=== 系统统计 ===' as section,
  '需要过期处理的积分' as metric,
  COUNT(*)::text as value,
  CONCAT('过期积分: ', COALESCE(SUM(remaining_credits), 0)) as detail,
  CASE 
    WHEN COUNT(*) = 0 THEN '正常' 
    WHEN COUNT(*) > 0 THEN '需要处理' 
  END as status,
  CASE WHEN COUNT(*) > 0 THEN '运行积分过期处理任务' ELSE '' END as recommendation,
  NOW()::text as checked_at
FROM subscription_credits 
WHERE status = 'active' AND end_date <= NOW();

-- 4. 数据一致性检查
WITH balance_check AS (
  SELECT 
    ucb.user_id,
    ucb.balance as recorded_balance,
    COALESCE(SUM(sc.remaining_credits), 0) as calculated_balance
  FROM user_credit_balance ucb
  LEFT JOIN subscription_credits sc ON ucb.user_id = sc.user_id 
    AND sc.status = 'active' 
    AND sc.end_date > NOW()
  GROUP BY ucb.user_id, ucb.balance
)
SELECT 
  '=== 数据一致性检查 ===' as section,
  user_id::text,
  recorded_balance::text,
  calculated_balance::text,
  CASE 
    WHEN recorded_balance = calculated_balance THEN '一致'
    ELSE '不一致'
  END as consistency_status,
  CASE 
    WHEN recorded_balance != calculated_balance THEN '需要重新计算余额'
    ELSE '正常'
  END as recommendation,
  NOW()::text as checked_at
FROM balance_check
WHERE recorded_balance != calculated_balance
ORDER BY user_id;

-- 5. 订阅状态监控
SELECT 
  '=== 订阅状态监控 ===' as section,
  user_id::text,
  subscription_id,
  total_credits::text,
  remaining_credits::text,
  computed_status,
  ROUND(days_until_expiry, 1)::text as days_until_expiry,
  stripe_subscription_status
FROM subscription_status_monitor
WHERE computed_status IN ('EXPIRED', 'EXPIRING_SOON', 'ACTIVE')
ORDER BY days_until_expiry ASC
LIMIT 20;

-- 6. 最近的Webhook处理状态
SELECT 
  '=== 最近Webhook活动 ===' as section,
  webhook_activity.user_id::text,
  webhook_activity.type,
  webhook_activity.amount::text,
  webhook_activity.description,
  webhook_activity.related_subscription_id,
  webhook_activity.created_at::text,
  webhook_activity.transaction_type
FROM (
  SELECT 
    ct.user_id,
    ct.type,
    ct.amount,
    ct.description,
    ct.related_subscription_id,
    ct.created_at,
    CASE 
      WHEN ct.type = 'subscription_bonus' AND ct.amount > 0 THEN '订阅积分发放'
      WHEN ct.type = 'consumption' AND ct.amount < 0 THEN '积分消费'
      WHEN ct.type = 'expiration' AND ct.amount < 0 THEN '积分过期'
      ELSE '其他'
    END as transaction_type
  FROM credit_transaction ct
  WHERE ct.created_at >= NOW() - INTERVAL '7 days'
    AND ct.related_subscription_id IS NOT NULL
  ORDER BY ct.created_at DESC
  LIMIT 20
) webhook_activity;

-- 7. 时间戳验证
SELECT 
  '=== 时间戳验证 ===' as section,
  'Stripe订阅表' as table_name,
  COUNT(*)::text as total_records,
  COUNT(current_period_start)::text as has_start_timestamp,
  COUNT(current_period_end)::text as has_end_timestamp,
  CASE 
    WHEN COUNT(*) = COUNT(current_period_start) AND COUNT(*) = COUNT(current_period_end)
    THEN '所有记录都有完整时间戳'
    ELSE CONCAT(COUNT(*) - COUNT(current_period_start), ' 条记录缺少开始时间戳, ', 
                COUNT(*) - COUNT(current_period_end), ' 条记录缺少结束时间戳')
  END as timestamp_status,
  NOW()::text as checked_at
FROM stripe_subscription

UNION ALL

SELECT 
  '=== 时间戳验证 ===' as section,
  '订阅积分表' as table_name,
  COUNT(*)::text as total_records,
  COUNT(start_date)::text as has_start_date,
  COUNT(end_date)::text as has_end_date,
  CASE 
    WHEN COUNT(*) = COUNT(start_date) AND COUNT(*) = COUNT(end_date)
    THEN '所有记录都有完整时间戳'
    ELSE CONCAT(COUNT(*) - COUNT(start_date), ' 条记录缺少开始日期, ', 
                COUNT(*) - COUNT(end_date), ' 条记录缺少结束日期')
  END as timestamp_status,
  NOW()::text as checked_at
FROM subscription_credits;

-- =================================================================
-- 使用说明
-- =================================================================

/*
使用指南：

1. 运行前准备：
   - 将脚本中的 'your-user-id' 替换为实际的用户UUID
   - 确保已执行 timestamp-fix-database-functions.sql

2. 检查结果解读：
   - section 列标识检查类型
   - consistency_status 显示数据是否一致
   - recommendation 提供修复建议

3. 常见问题修复：
   
   a) 余额不一致：
      SELECT recalculate_user_balance('user-uuid');
   
   b) 积分过期：
      SELECT expire_subscription_credits();
   
   c) 时间戳同步：
      SELECT sync_subscription_credits_timestamps();
   
   d) 用户积分详情：
      SELECT get_user_credit_details('user-uuid');

4. 定时任务设置：
   建议设置每小时执行一次：
   0 * * * * curl -X POST -H "Authorization: Bearer YOUR_API_KEY" \
     https://your-domain.com/api/credits/expire

5. 手动触发过期处理：
   curl -X POST -H "x-manual-trigger: true" \
     https://your-domain.com/api/credits/expire
*/ 