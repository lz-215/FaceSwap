-- =================================================================
-- 订阅积分系统功能测试脚本
-- =================================================================

-- 创建测试环境和测试数据
BEGIN;

-- 1. 创建测试用户（如果不存在）
INSERT INTO "user" (id, email, name, email_verified) VALUES 
('test_user_1', 'test1@example.com', 'Test User 1', true),
('test_user_2', 'test2@example.com', 'Test User 2', true),
('test_user_3', 'test3@example.com', 'Test User 3', true)
ON CONFLICT (id) DO NOTHING;

-- 2. 测试初始化用户积分
SELECT 'Testing initialize_user_credits...' as test_step;

-- 初始化测试用户积分
SELECT initialize_user_credits('test_user_1', 0) as init_result_1;
SELECT initialize_user_credits('test_user_2') as init_result_2;
SELECT initialize_user_credits('test_user_3', 0) as init_result_3;

-- 验证初始化结果
SELECT 'User credit balances after initialization:' as info;
SELECT user_id, balance, total_recharged, total_consumed 
FROM user_credit_balance 
WHERE user_id IN ('test_user_1', 'test_user_2', 'test_user_3');

-- 3. 测试订阅支付功能
SELECT 'Testing subscription payment processing...' as test_step;

-- 模拟月订阅支付（120积分，30天）
SELECT handle_subscription_payment_success(
  'sub_monthly_test_123',
  'test_user_1',
  120,
  'monthly',
  NOW(),
  NOW() + INTERVAL '30 days'
) as monthly_subscription_result;

-- 模拟年订阅支付（1800积分，365天）
SELECT handle_subscription_payment_success(
  'sub_yearly_test_456',
  'test_user_2',
  1800,
  'yearly',
  NOW(),
  NOW() + INTERVAL '365 days'
) as yearly_subscription_result;

-- 验证订阅积分结果
SELECT 'User credit balances after subscription payments:' as info;
SELECT user_id, balance, total_recharged, total_consumed 
FROM user_credit_balance 
WHERE user_id IN ('test_user_1', 'test_user_2', 'test_user_3');

-- 查看订阅积分详情
SELECT 'Subscription credits details:' as info;
SELECT user_id, subscription_id, credits, remaining_credits, start_date, end_date, status
FROM subscription_credits
WHERE user_id IN ('test_user_1', 'test_user_2');

-- 4. 测试积分消费功能
SELECT 'Testing credit consumption...' as test_step;

-- 用户1消费5个积分（应从订阅积分中扣除）
SELECT consume_credits('test_user_1', 5, 'Face swap operation') as consume_result_1;

-- 用户2消费20个积分（应从订阅积分中扣除）
SELECT consume_credits('test_user_2', 20, 'Face swap operation') as consume_result_2;

-- 验证消费结果
SELECT 'User credit balances after consumption:' as info;
SELECT user_id, balance, total_recharged, total_consumed 
FROM user_credit_balance 
WHERE user_id IN ('test_user_1', 'test_user_2', 'test_user_3');

-- 查看消费后的订阅积分余量
SELECT 'Subscription credits after consumption:' as info;
SELECT user_id, subscription_id, credits, remaining_credits, start_date, end_date, status
FROM subscription_credits
WHERE user_id IN ('test_user_1', 'test_user_2');

-- 5. 测试余额不足的情况
SELECT 'Testing insufficient credits scenario...' as test_step;

DO $$
BEGIN
  BEGIN
    -- 尝试让用户3消费超过余额的积分
    PERFORM consume_credits('test_user_3', 1000, 'Should fail - insufficient credits');
    RAISE NOTICE 'ERROR: Should have failed due to insufficient credits';
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'SUCCESS: Correctly prevented consumption due to insufficient credits: %', SQLERRM;
  END;
END $$;

-- 6. 测试 Stripe Customer 关联
SELECT 'Testing Stripe customer association...' as test_step;

-- 创建测试 Stripe 客户记录
INSERT INTO stripe_customer (user_id, customer_id) VALUES 
('test_user_1', 'cus_test_customer_123'),
('test_user_2', 'cus_test_customer_456'),
('test_user_3', 'cus_test_customer_789')
ON CONFLICT (user_id) DO UPDATE SET customer_id = EXCLUDED.customer_id;

-- 测试通过 customer_id 查找用户
SELECT get_user_by_stripe_customer('cus_test_customer_123') as found_user_1;
SELECT get_user_by_stripe_customer('cus_test_customer_456') as found_user_2;
SELECT get_user_by_stripe_customer('cus_nonexistent') as found_user_none;

-- 7. 测试重复订阅支付检测
SELECT 'Testing duplicate subscription payment prevention...' as test_step;

-- 尝试重复处理同一个订阅支付
SELECT handle_subscription_payment_success(
  'sub_monthly_test_123',
  'test_user_1',
  120,
  'monthly',
  NOW(),
  NOW() + INTERVAL '30 days'
) as duplicate_subscription_result;

-- 8. 测试积分过期功能
SELECT 'Testing subscription credit expiration...' as test_step;

-- 创建一个已过期的订阅积分记录
INSERT INTO subscription_credits (
  id, user_id, subscription_id, credits, remaining_credits,
  start_date, end_date, status, created_at, updated_at
) VALUES (
  'expired_sub_test_1',
  'test_user_3',
  'sub_expired_test_123',
  50,
  30,
  NOW() - INTERVAL '60 days',
  NOW() - INTERVAL '30 days',
  'active',
  NOW() - INTERVAL '60 days',
  NOW() - INTERVAL '30 days'
);

-- 手动更新用户3的积分余额，模拟有过期积分
UPDATE user_credit_balance 
SET 
  balance = balance + 30,
  total_recharged = total_recharged + 50
WHERE user_id = 'test_user_3';

-- 执行过期积分处理
SELECT 'Before expiration processing:' as info;
SELECT user_id, balance FROM user_credit_balance WHERE user_id = 'test_user_3';

SELECT expire_subscription_credits() as expiration_result;

SELECT 'After expiration processing:' as info;
SELECT user_id, balance FROM user_credit_balance WHERE user_id = 'test_user_3';

-- 9. 测试奖励积分功能
SELECT 'Testing bonus credits...' as test_step;

-- 给用户1添加奖励积分
SELECT add_bonus_credits_secure(
  'test_user_1', 
  25, 
  'Welcome bonus', 
  '{"source": "test", "reason": "welcome_bonus"}'::jsonb
) as bonus_result;

-- 验证奖励积分结果
SELECT 'Balance after bonus credits:' as info;
SELECT user_id, balance, total_recharged FROM user_credit_balance WHERE user_id = 'test_user_1';

-- 10. 测试增强版获取积分函数
SELECT 'Testing enhanced get_user_credits function...' as test_step;

-- 获取用户详细积分信息
SELECT get_user_credits('test_user_1') as user1_detailed_credits;
SELECT get_user_credits('test_user_2') as user2_detailed_credits;

-- 11. 测试简化版函数（向后兼容）
SELECT 'Testing simplified functions for backward compatibility...' as test_step;

-- 测试 get_credits 函数
SELECT get_credits('test_user_1') as user1_credits;
SELECT get_credits('test_user_2') as user2_credits;

-- 测试 use_credits 函数
SELECT use_credits('test_user_1', 2) as use_result_1;
SELECT use_credits('test_user_2', 3) as use_result_2;

-- 最终余额检查
SELECT 'Final credit balances:' as info;
SELECT user_id, balance, total_recharged, total_consumed 
FROM user_credit_balance 
WHERE user_id IN ('test_user_1', 'test_user_2', 'test_user_3');

-- 12. 验证交易记录
SELECT 'Recent credit transactions:' as info;
SELECT user_id, type, amount, balance_after, description, created_at
FROM credit_transaction 
WHERE user_id IN ('test_user_1', 'test_user_2', 'test_user_3')
ORDER BY created_at DESC
LIMIT 20;

-- 13. 系统完整性检查
SELECT 'System integrity checks:' as test_step;

-- 检查是否所有交易都有对应的余额记录
SELECT 'Orphaned transactions (should be 0):' as check_name,
COUNT(*) as count
FROM credit_transaction ct
LEFT JOIN user_credit_balance ucb ON ct.user_id = ucb.user_id
WHERE ucb.user_id IS NULL;

-- 检查是否有负余额（应该为0）
SELECT 'Negative balances (should be 0):' as check_name,
COUNT(*) as count
FROM user_credit_balance
WHERE balance < 0;

-- 检查积分计算是否正确
SELECT 'Balance calculation verification:' as check_name;
SELECT 
  ucb.user_id,
  ucb.balance as current_balance,
  COALESCE(SUM(CASE WHEN ct.amount > 0 THEN ct.amount ELSE 0 END), 0) as total_added,
  COALESCE(SUM(CASE WHEN ct.amount < 0 THEN -ct.amount ELSE 0 END), 0) as total_consumed,
  (COALESCE(SUM(CASE WHEN ct.amount > 0 THEN ct.amount ELSE 0 END), 0) - 
   COALESCE(SUM(CASE WHEN ct.amount < 0 THEN -ct.amount ELSE 0 END), 0)) as calculated_balance,
  CASE 
    WHEN ucb.balance = (COALESCE(SUM(CASE WHEN ct.amount > 0 THEN ct.amount ELSE 0 END), 0) - 
                       COALESCE(SUM(CASE WHEN ct.amount < 0 THEN -ct.amount ELSE 0 END), 0))
    THEN '✅ CORRECT'
    ELSE '❌ MISMATCH'
  END as verification_status
FROM user_credit_balance ucb
LEFT JOIN credit_transaction ct ON ucb.user_id = ct.user_id
WHERE ucb.user_id IN ('test_user_1', 'test_user_2', 'test_user_3')
GROUP BY ucb.user_id, ucb.balance;

-- 14. 测试积分套餐数据
SELECT 'Credit packages verification:' as test_step;
SELECT name, credits, price, subscription_period, subscription_duration_days, is_active
FROM credit_package
ORDER BY sort_order;

-- 15. 订阅积分状态检查
SELECT 'Subscription credits status check:' as test_step;
SELECT 
  user_id,
  subscription_id,
  credits,
  remaining_credits,
  status,
  CASE 
    WHEN end_date < NOW() THEN 'EXPIRED'
    WHEN end_date > NOW() THEN 'ACTIVE'
    ELSE 'UNKNOWN'
  END as calculated_status,
  end_date
FROM subscription_credits
ORDER BY user_id, end_date;

-- 16. 性能测试（可选）
SELECT 'Performance test summary:' as test_step;

DO $$
DECLARE
  start_time timestamp;
  end_time timestamp;
  duration interval;
BEGIN
  start_time := clock_timestamp();
  
  -- 执行100次积分查询
  FOR i IN 1..100 LOOP
    PERFORM get_user_credits('test_user_1');
  END LOOP;
  
  end_time := clock_timestamp();
  duration := end_time - start_time;
  
  RAISE NOTICE 'Time for 100 enhanced credit balance queries: %', duration;

  start_time := clock_timestamp();
  
  -- 执行100次消费操作
  FOR i IN 1..100 LOOP
    PERFORM consume_credits('test_user_1', 1, 'Performance test');
    -- 添加积分以保持余额
    PERFORM add_bonus_credits_secure('test_user_1', 1, 'Performance test recharge', '{"test": true}'::jsonb);
  END LOOP;
  
  end_time := clock_timestamp();
  duration := end_time - start_time;
  
  RAISE NOTICE 'Time for 100 consume/recharge cycles: %', duration;
END $$;

-- 17. 测试定时过期处理函数
SELECT 'Testing scheduled expiration function...' as test_step;

SELECT scheduled_expire_credits() as scheduled_expiration_result;

-- 18. 数据一致性最终检查
SELECT 'Final data consistency check:' as test_step;

-- 检查所有订阅积分的余量是否与用户余额一致
WITH subscription_totals AS (
  SELECT 
    user_id,
    SUM(remaining_credits) as total_subscription_remaining
  FROM subscription_credits 
  WHERE status = 'active'
  GROUP BY user_id
)
SELECT 
  ucb.user_id,
  ucb.balance as user_balance,
  COALESCE(st.total_subscription_remaining, 0) as calculated_subscription_balance,
  CASE 
    WHEN ucb.balance = COALESCE(st.total_subscription_remaining, 0)
    THEN '✅ CONSISTENT'
    ELSE '❌ INCONSISTENT'
  END as consistency_check
FROM user_credit_balance ucb
LEFT JOIN subscription_totals st ON ucb.user_id = st.user_id
WHERE ucb.user_id IN ('test_user_1', 'test_user_2', 'test_user_3');

-- 清理测试数据（注释掉以保留测试结果）
/*
DELETE FROM subscription_credits WHERE user_id IN ('test_user_1', 'test_user_2', 'test_user_3');
DELETE FROM credit_transaction WHERE user_id IN ('test_user_1', 'test_user_2', 'test_user_3');
DELETE FROM user_credit_balance WHERE user_id IN ('test_user_1', 'test_user_2', 'test_user_3');
DELETE FROM stripe_customer WHERE user_id IN ('test_user_1', 'test_user_2', 'test_user_3');
DELETE FROM "user" WHERE id IN ('test_user_1', 'test_user_2', 'test_user_3');
*/

SELECT '=== ALL SUBSCRIPTION SYSTEM TESTS COMPLETED ===' as final_message;

COMMIT; 