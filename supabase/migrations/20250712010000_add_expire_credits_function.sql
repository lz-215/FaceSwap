-- 数据库函数：处理过期的订阅积分并更新用户总余额
-- 1. 查找所有已过期的订阅记录
-- 2. 将其状态更新为 'expired'
-- 3. 重新计算受影响用户的总积分余额

CREATE OR REPLACE FUNCTION expire_credits()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expired_subscription RECORD;
  v_affected_users UUID[] := '{}';
  v_user_id UUID;
  v_total_expired_count INTEGER := 0;
BEGIN
  -- 1. 查找所有结束日期已过但状态仍为 'active' 的订阅
  FOR v_expired_subscription IN
    SELECT *
    FROM subscription_status_monitor
    WHERE end_date <= NOW() AND status = 'active'
  LOOP
    -- 2. 更新这些订阅的状态为 'expired' 并清空剩余积分
    UPDATE subscription_status_monitor
    SET
      status = 'expired',
      remaining_credits = 0,
      updated_at = NOW()
    WHERE subscription_id = v_expired_subscription.subscription_id;

    -- 记录受影响的用户ID
    v_affected_users := array_append(v_affected_users, v_expired_subscription.user_id);
    v_total_expired_count := v_total_expired_count + 1;
  END LOOP;

  -- 3. 对所有受影响的用户，重新计算其总积分
  FOREACH v_user_id IN ARRAY v_affected_users
  LOOP
    PERFORM recalculate_user_balance(v_user_id);
  END LOOP;

  -- 返回执行结果
  RETURN jsonb_build_object(
    'success', true,
    'expired_subscriptions_count', v_total_expired_count,
    'affected_users_count', array_length(v_affected_users, 1)
  );
END;
$$;

-- 辅助函数：重新计算单个用户的总积分余额
-- 该函数会汇总用户所有有效订阅的剩余积分
CREATE OR REPLACE FUNCTION recalculate_user_balance(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_balance INTEGER;
BEGIN
  -- 计算用户所有 'active' 订阅的剩余积分总和
  SELECT COALESCE(SUM(remaining_credits), 0)
  INTO v_new_balance
  FROM subscription_status_monitor
  WHERE user_id = p_user_id AND status = 'active';

  -- 更新 user_credit_balance 表
  INSERT INTO user_credit_balance (user_id, balance, updated_at)
  VALUES (p_user_id, v_new_balance, NOW())
  ON CONFLICT (user_id)
  DO UPDATE SET
    balance = v_new_balance,
    updated_at = NOW();
END;
$$;
