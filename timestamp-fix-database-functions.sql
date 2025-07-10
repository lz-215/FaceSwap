-- =================================================================
-- 时间戳修复和积分过期处理数据库函数
-- 解决订阅到期、续费、积分过期等时间戳问题
-- =================================================================

BEGIN;

-- 1. 创建智能积分消费函数（优先使用即将过期的积分）
CREATE OR REPLACE FUNCTION consume_credits_smart(
  p_user_id UUID,
  p_amount INTEGER,
  p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_balance INTEGER := 0;
  v_remaining_needed INTEGER := p_amount;
  v_credit_record RECORD;
  v_consumed_amount INTEGER;
  v_new_balance INTEGER;
  v_transaction_id UUID;
BEGIN
  -- 检查用户总积分余额
  SELECT COALESCE(SUM(remaining_credits), 0) INTO v_total_balance
  FROM subscription_credits 
  WHERE user_id = p_user_id AND status = 'active' AND end_date > NOW();

  IF v_total_balance < p_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', '积分不足',
      'available', v_total_balance,
      'required', p_amount
    );
  END IF;

  -- 按到期时间排序，优先消费即将过期的积分
  FOR v_credit_record IN 
    SELECT * FROM subscription_credits 
    WHERE user_id = p_user_id 
      AND status = 'active' 
      AND remaining_credits > 0
      AND end_date > NOW()
    ORDER BY end_date ASC
  LOOP
    EXIT WHEN v_remaining_needed <= 0;
    
    -- 计算本次消费的积分数量
    v_consumed_amount := LEAST(v_credit_record.remaining_credits, v_remaining_needed);
    
    -- 更新订阅积分记录
    UPDATE subscription_credits 
    SET 
      remaining_credits = remaining_credits - v_consumed_amount,
      updated_at = NOW()
    WHERE id = v_credit_record.id;
    
    -- 记录消费交易
    INSERT INTO credit_transaction (
      user_id,
      amount,
      type,
      description,
      balance_after,
      metadata,
      related_subscription_id
    ) VALUES (
      p_user_id,
      -v_consumed_amount,
      'consumption',
      COALESCE(p_description, '智能积分消费'),
      v_total_balance - (p_amount - v_remaining_needed + v_consumed_amount),
      jsonb_build_object(
        'subscription_id', v_credit_record.subscription_id,
        'consumed_from_subscription', true,
        'expiry_date', v_credit_record.end_date
      ),
      v_credit_record.subscription_id
    ) RETURNING id INTO v_transaction_id;
    
    v_remaining_needed := v_remaining_needed - v_consumed_amount;
  END LOOP;

  -- 计算新的总余额
  SELECT COALESCE(SUM(remaining_credits), 0) INTO v_new_balance
  FROM subscription_credits 
  WHERE user_id = p_user_id AND status = 'active' AND end_date > NOW();

  -- 更新用户积分余额表
  INSERT INTO user_credit_balance (user_id, balance, total_consumed, updated_at)
  VALUES (p_user_id, v_new_balance, p_amount, NOW())
  ON CONFLICT (user_id) 
  DO UPDATE SET 
    balance = v_new_balance,
    total_consumed = user_credit_balance.total_consumed + p_amount,
    updated_at = NOW();

  RETURN jsonb_build_object(
    'success', true,
    'consumed', p_amount,
    'balance_after', v_new_balance,
    'transaction_id', v_transaction_id
  );
END;
$$;

-- 2. 创建积分过期处理函数
CREATE OR REPLACE FUNCTION expire_subscription_credits()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expired_record RECORD;
  v_total_expired INTEGER := 0;
  v_affected_users INTEGER := 0;
  v_expired_credits_array JSONB[] := '{}';
BEGIN
  -- 查找所有过期的积分
  FOR v_expired_record IN 
    SELECT * FROM subscription_credits 
    WHERE status = 'active' 
      AND end_date <= NOW()
      AND remaining_credits > 0
  LOOP
    -- 记录过期交易
    INSERT INTO credit_transaction (
      user_id,
      amount,
      type,
      description,
      balance_after,
      metadata,
      related_subscription_id
    ) VALUES (
      v_expired_record.user_id,
      -v_expired_record.remaining_credits,
      'expiration',
      '订阅积分过期',
      0, -- 将在后面更新
      jsonb_build_object(
        'subscription_id', v_expired_record.subscription_id,
        'original_credits', v_expired_record.credits,
        'expired_credits', v_expired_record.remaining_credits,
        'expiry_date', v_expired_record.end_date
      ),
      v_expired_record.subscription_id
    );

    -- 标记积分为过期
    UPDATE subscription_credits 
    SET 
      status = 'expired',
      remaining_credits = 0,
      updated_at = NOW()
    WHERE id = v_expired_record.id;

    -- 累计统计
    v_total_expired := v_total_expired + v_expired_record.remaining_credits;
    
    -- 添加到结果数组
    v_expired_credits_array := v_expired_credits_array || jsonb_build_object(
      'user_id', v_expired_record.user_id,
      'subscription_id', v_expired_record.subscription_id,
      'expired_credits', v_expired_record.remaining_credits,
      'end_date', v_expired_record.end_date
    );
  END LOOP;

  -- 重新计算所有受影响用户的余额
  FOR v_expired_record IN 
    SELECT DISTINCT user_id FROM subscription_credits 
    WHERE status = 'expired' 
      AND updated_at >= NOW() - INTERVAL '1 minute'
  LOOP
    PERFORM recalculate_user_balance(v_expired_record.user_id);
    v_affected_users := v_affected_users + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'total_expired_credits', v_total_expired,
    'affected_users', v_affected_users,
    'expired_records', v_expired_credits_array,
    'processed_at', NOW()
  );
END;
$$;

-- 3. 创建用户余额重新计算函数
CREATE OR REPLACE FUNCTION recalculate_user_balance(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active_balance INTEGER := 0;
  v_total_recharged INTEGER := 0;
  v_total_consumed INTEGER := 0;
BEGIN
  -- 计算活跃积分总和
  SELECT COALESCE(SUM(remaining_credits), 0) INTO v_active_balance
  FROM subscription_credits 
  WHERE user_id = p_user_id 
    AND status = 'active' 
    AND end_date > NOW();

  -- 计算总充值积分
  SELECT COALESCE(SUM(credits), 0) INTO v_total_recharged
  FROM subscription_credits 
  WHERE user_id = p_user_id;

  -- 计算总消费积分（从交易记录中统计）
  SELECT COALESCE(SUM(ABS(amount)), 0) INTO v_total_consumed
  FROM credit_transaction 
  WHERE user_id = p_user_id 
    AND type IN ('consumption', 'expiration')
    AND amount < 0;

  -- 更新用户积分余额
  INSERT INTO user_credit_balance (
    user_id, 
    balance, 
    total_recharged, 
    total_consumed,
    updated_at
  )
  VALUES (
    p_user_id, 
    v_active_balance, 
    v_total_recharged, 
    v_total_consumed,
    NOW()
  )
  ON CONFLICT (user_id) 
  DO UPDATE SET 
    balance = v_active_balance,
    total_recharged = v_total_recharged,
    total_consumed = v_total_consumed,
    updated_at = NOW();

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'balance', v_active_balance,
    'total_recharged', v_total_recharged,
    'total_consumed', v_total_consumed,
    'updated_at', NOW()
  );
END;
$$;

-- 4. 创建订阅续费处理函数
CREATE OR REPLACE FUNCTION handle_subscription_renewal(
  p_subscription_id TEXT,
  p_user_id UUID,
  p_credits INTEGER,
  p_period_start TIMESTAMP WITH TIME ZONE,
  p_period_end TIMESTAMP WITH TIME ZONE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_credits RECORD;
  v_new_credits_id UUID;
BEGIN
  -- 检查是否已存在该订阅期间的积分记录
  SELECT * INTO v_existing_credits
  FROM subscription_credits 
  WHERE subscription_id = p_subscription_id 
    AND start_date = p_period_start
    AND end_date = p_period_end;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', '积分记录已存在，跳过创建',
      'existing_credits_id', v_existing_credits.id,
      'credits', v_existing_credits.credits
    );
  END IF;

  -- 创建新的积分记录
  INSERT INTO subscription_credits (
    user_id,
    subscription_id,
    credits,
    remaining_credits,
    start_date,
    end_date,
    status
  ) VALUES (
    p_user_id,
    p_subscription_id,
    p_credits,
    p_credits,
    p_period_start,
    p_period_end,
    'active'
  ) RETURNING id INTO v_new_credits_id;

  -- 添加积分到用户余额
  INSERT INTO user_credit_balance (user_id, balance, total_recharged, updated_at)
  VALUES (p_user_id, p_credits, p_credits, NOW())
  ON CONFLICT (user_id) 
  DO UPDATE SET 
    balance = user_credit_balance.balance + p_credits,
    total_recharged = user_credit_balance.total_recharged + p_credits,
    updated_at = NOW();

  -- 记录充值交易
  INSERT INTO credit_transaction (
    user_id,
    amount,
    type,
    description,
    balance_after,
    metadata,
    related_subscription_id
  ) VALUES (
    p_user_id,
    p_credits,
    'subscription_renewal',
    '订阅续费积分',
    (SELECT balance FROM user_credit_balance WHERE user_id = p_user_id),
    jsonb_build_object(
      'subscription_id', p_subscription_id,
      'period_start', p_period_start,
      'period_end', p_period_end,
      'credits_added', p_credits
    ),
    p_subscription_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'credits_id', v_new_credits_id,
    'credits_added', p_credits,
    'period_start', p_period_start,
    'period_end', p_period_end,
    'user_balance', (SELECT balance FROM user_credit_balance WHERE user_id = p_user_id)
  );
END;
$$;

-- 5. 创建订阅状态监控视图
CREATE OR REPLACE VIEW subscription_status_monitor AS
SELECT 
  sc.user_id,
  sc.subscription_id,
  sc.credits as total_credits,
  sc.remaining_credits,
  sc.start_date,
  sc.end_date,
  sc.status,
  CASE 
    WHEN sc.end_date <= NOW() AND sc.status = 'active' THEN 'EXPIRED'
    WHEN sc.end_date <= NOW() + INTERVAL '7 days' AND sc.status = 'active' THEN 'EXPIRING_SOON'
    WHEN sc.end_date > NOW() + INTERVAL '7 days' AND sc.status = 'active' THEN 'ACTIVE'
    WHEN sc.status = 'expired' THEN 'EXPIRED'
    WHEN sc.status = 'cancelled' THEN 'CANCELLED'
    ELSE 'UNKNOWN'
  END as computed_status,
  EXTRACT(EPOCH FROM (sc.end_date - NOW())) / 86400 as days_until_expiry,
  ucb.balance as user_total_balance,
  ss.status as stripe_subscription_status
FROM subscription_credits sc
LEFT JOIN user_credit_balance ucb ON sc.user_id = ucb.user_id
LEFT JOIN stripe_subscription ss ON sc.subscription_id = ss.subscription_id
ORDER BY sc.end_date ASC;

-- 6. 创建定时任务执行函数
CREATE OR REPLACE FUNCTION scheduled_expire_credits()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expire_result JSONB;
  v_health_check JSONB;
BEGIN
  -- 执行积分过期处理
  SELECT expire_subscription_credits() INTO v_expire_result;
  
  -- 执行健康检查
  SELECT jsonb_build_object(
    'total_active_subscriptions', (
      SELECT COUNT(*) FROM subscription_credits 
      WHERE status = 'active' AND end_date > NOW()
    ),
    'total_expired_subscriptions', (
      SELECT COUNT(*) FROM subscription_credits 
      WHERE status = 'expired'
    ),
    'users_with_credits', (
      SELECT COUNT(DISTINCT user_id) FROM subscription_credits 
      WHERE status = 'active' AND remaining_credits > 0
    ),
    'total_active_credits', (
      SELECT COALESCE(SUM(remaining_credits), 0) FROM subscription_credits 
      WHERE status = 'active' AND end_date > NOW()
    )
  ) INTO v_health_check;

  RETURN jsonb_build_object(
    'expire_result', v_expire_result,
    'health_check', v_health_check,
    'execution_time', NOW()
  );
END;
$$;

-- 7. 创建订阅积分同步函数（修复时间戳问题）
CREATE OR REPLACE FUNCTION sync_subscription_credits_timestamps()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_count INTEGER := 0;
  v_stripe_sub RECORD;
BEGIN
  -- 同步Stripe订阅的时间戳到subscription_credits表
  FOR v_stripe_sub IN 
    SELECT 
      ss.subscription_id,
      ss.user_id,
      ss.current_period_start,
      ss.current_period_end,
      ss.status
    FROM stripe_subscription ss
    WHERE ss.current_period_start IS NOT NULL 
      AND ss.current_period_end IS NOT NULL
  LOOP
    -- 更新或创建对应的积分记录
    UPDATE subscription_credits 
    SET 
      start_date = v_stripe_sub.current_period_start,
      end_date = v_stripe_sub.current_period_end,
      updated_at = NOW()
    WHERE subscription_id = v_stripe_sub.subscription_id
      AND (start_date != v_stripe_sub.current_period_start 
           OR end_date != v_stripe_sub.current_period_end);
    
    IF FOUND THEN
      v_updated_count := v_updated_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'updated_records', v_updated_count,
    'sync_time', NOW()
  );
END;
$$;

-- 8. 创建用户积分详情查询函数
CREATE OR REPLACE FUNCTION get_user_credit_details(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_balance user_credit_balance;
  v_active_subscriptions JSONB;
  v_recent_transactions JSONB;
BEGIN
  -- 获取用户积分余额
  SELECT * INTO v_user_balance
  FROM user_credit_balance
  WHERE user_id = p_user_id;

  -- 获取活跃的订阅积分
  SELECT jsonb_agg(
    jsonb_build_object(
      'subscription_id', subscription_id,
      'credits', credits,
      'remaining_credits', remaining_credits,
      'start_date', start_date,
      'end_date', end_date,
      'status', status,
      'days_until_expiry', EXTRACT(EPOCH FROM (end_date - NOW())) / 86400
    )
  ) INTO v_active_subscriptions
  FROM subscription_credits
  WHERE user_id = p_user_id
    AND status = 'active'
    AND end_date > NOW()
  ORDER BY end_date ASC;

  -- 获取最近的交易记录
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', id,
      'amount', amount,
      'type', type,
      'description', description,
      'balance_after', balance_after,
      'created_at', created_at,
      'metadata', metadata
    )
  ) INTO v_recent_transactions
  FROM (
    SELECT * FROM credit_transaction
    WHERE user_id = p_user_id
    ORDER BY created_at DESC
    LIMIT 10
  ) recent;

  RETURN jsonb_build_object(
    'user_id', p_user_id,
    'balance', COALESCE(v_user_balance.balance, 0),
    'total_recharged', COALESCE(v_user_balance.total_recharged, 0),
    'total_consumed', COALESCE(v_user_balance.total_consumed, 0),
    'active_subscriptions', COALESCE(v_active_subscriptions, '[]'::jsonb),
    'recent_transactions', COALESCE(v_recent_transactions, '[]'::jsonb),
    'last_updated', COALESCE(v_user_balance.updated_at, NOW())
  );
END;
$$;

COMMIT;

-- =================================================================
-- 创建索引以优化查询性能
-- =================================================================

-- 订阅积分表的时间戳索引
CREATE INDEX IF NOT EXISTS idx_subscription_credits_end_date_status 
ON subscription_credits(end_date, status) 
WHERE status = 'active';

-- 订阅积分表的用户和状态索引
CREATE INDEX IF NOT EXISTS idx_subscription_credits_user_status 
ON subscription_credits(user_id, status, end_date) 
WHERE status = 'active';

-- 交易记录的时间戳索引
CREATE INDEX IF NOT EXISTS idx_credit_transaction_created_at_user 
ON credit_transaction(user_id, created_at DESC);

-- Stripe订阅的时间戳索引
CREATE INDEX IF NOT EXISTS idx_stripe_subscription_periods 
ON stripe_subscription(current_period_start, current_period_end)
WHERE current_period_start IS NOT NULL;

-- =================================================================
-- 提供使用说明
-- =================================================================

/*
使用指南：

1. 定时执行积分过期处理（建议每小时执行一次）：
   SELECT scheduled_expire_credits();

2. 手动处理积分过期：
   SELECT expire_subscription_credits();

3. 查看用户积分详情：
   SELECT get_user_credit_details('user-uuid');

4. 智能消费积分（优先使用即将过期的）：
   SELECT consume_credits_smart('user-uuid', 5, '人脸交换操作');

5. 处理订阅续费：
   SELECT handle_subscription_renewal(
     'sub_xxx', 
     'user-uuid', 
     120, 
     '2024-01-01'::timestamp, 
     '2024-02-01'::timestamp
   );

6. 监控订阅状态：
   SELECT * FROM subscription_status_monitor;

7. 重新计算用户余额：
   SELECT recalculate_user_balance('user-uuid');

8. 同步订阅时间戳：
   SELECT sync_subscription_credits_timestamps();
*/ 