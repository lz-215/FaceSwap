-- =================================================================
-- 订阅积分系统数据库函数
-- =================================================================

-- 1. 处理订阅支付成功的函数
CREATE OR REPLACE FUNCTION handle_subscription_payment_success(
  p_subscription_id TEXT,
  p_user_id TEXT,
  p_credits INTEGER,
  p_subscription_period TEXT,
  p_current_period_start TIMESTAMP WITH TIME ZONE,
  p_current_period_end TIMESTAMP WITH TIME ZONE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_balance user_credit_balance;
  v_new_balance INTEGER;
  v_transaction_id TEXT;
  v_subscription_credit_id TEXT;
  v_existing_subscription_credit subscription_credits;
BEGIN
  -- 检查是否已存在该订阅期的积分记录
  SELECT * INTO v_existing_subscription_credit
  FROM subscription_credits
  WHERE subscription_id = p_subscription_id 
    AND start_date = p_current_period_start
    AND end_date = p_current_period_end;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'message', 'Subscription credits already processed for this period'
    );
  END IF;

  -- 使过期的订阅积分失效
  UPDATE subscription_credits
  SET status = 'expired', updated_at = NOW()
  WHERE user_id = p_user_id 
    AND subscription_id = p_subscription_id
    AND status = 'active'
    AND end_date < NOW();

  -- 创建新的订阅积分记录
  v_subscription_credit_id := gen_random_uuid()::TEXT;
  INSERT INTO subscription_credits (
    id,
    user_id,
    subscription_id,
    credits,
    remaining_credits,
    start_date,
    end_date,
    status,
    created_at,
    updated_at
  ) VALUES (
    v_subscription_credit_id,
    p_user_id,
    p_subscription_id,
    p_credits,
    p_credits,
    p_current_period_start,
    p_current_period_end,
    'active',
    NOW(),
    NOW()
  );

  -- 获取或创建用户积分余额
  SELECT * INTO v_user_balance 
  FROM user_credit_balance 
  WHERE user_id = p_user_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    -- 创建新的积分余额记录
    v_new_balance := p_credits;
    
    INSERT INTO user_credit_balance (
      id, 
      user_id, 
      balance,
      total_recharged, 
      total_consumed, 
      created_at, 
      updated_at
    ) VALUES (
      gen_random_uuid()::TEXT, 
      p_user_id, 
      v_new_balance,
      p_credits, 
      0, 
      NOW(), 
      NOW()
    );
  ELSE
    -- 更新现有余额：直接重置为新周期额度（清零旧积分，只保留新积分）
    v_new_balance := p_credits;
    
    UPDATE user_credit_balance 
    SET 
      balance = v_new_balance,
      total_recharged = total_recharged + p_credits, 
      updated_at = NOW()
    WHERE user_id = p_user_id;
  END IF;

  -- 创建积分交易记录
  v_transaction_id := gen_random_uuid()::TEXT;
  INSERT INTO credit_transaction (
    id, 
    user_id, 
    type,
    amount, 
    balance_after,
    description, 
    related_subscription_id,
    metadata, 
    created_at
  ) VALUES (
    v_transaction_id, 
    p_user_id, 
    'subscription',
    p_credits, 
    v_new_balance,
    p_subscription_period || '订阅充值' || p_credits || '积分', 
    p_subscription_id,
    jsonb_build_object(
      'subscriptionId', p_subscription_id,
      'subscriptionPeriod', p_subscription_period,
      'periodStart', p_current_period_start,
      'periodEnd', p_current_period_end,
      'processedAt', NOW()
    ),
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'duplicate', false,
    'subscriptionId', p_subscription_id,
    'subscriptionCreditId', v_subscription_credit_id,
    'transactionId', v_transaction_id,
    'newBalance', v_new_balance,
    'amountAdded', p_credits,
    'userId', p_user_id,
    'message', 'Subscription payment processed successfully'
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to process subscription payment: %', SQLERRM;
END;
$$;

-- 2. 消费积分函数（优先使用即将过期的订阅积分）
CREATE OR REPLACE FUNCTION consume_credits(
  p_user_id TEXT,
  p_amount INTEGER,
  p_description TEXT DEFAULT 'Credit consumption'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_balance user_credit_balance;
  v_consumed INTEGER := 0;
  v_remaining_to_consume INTEGER := p_amount;
  v_new_balance INTEGER;
  v_transaction_id TEXT;
  v_subscription_credit RECORD;
BEGIN
  -- 锁定用户积分记录
  SELECT * INTO v_user_balance
  FROM user_credit_balance
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- 检查积分是否充足
  IF v_user_balance IS NULL THEN
    RAISE EXCEPTION 'User credit balance not found';
  END IF;

  IF v_user_balance.balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient credits. Current balance: %, Required: %', v_user_balance.balance, p_amount;
  END IF;

  -- 按到期时间顺序消费订阅积分
  FOR v_subscription_credit IN 
    SELECT * FROM subscription_credits 
    WHERE user_id = p_user_id 
      AND status = 'active' 
      AND remaining_credits > 0
      AND end_date > NOW()
    ORDER BY end_date ASC
  LOOP
    IF v_remaining_to_consume <= 0 THEN
      EXIT;
    END IF;
    
    DECLARE
      v_consume_from_this INTEGER := LEAST(v_subscription_credit.remaining_credits, v_remaining_to_consume);
    BEGIN
      -- 更新订阅积分记录
      UPDATE subscription_credits
      SET 
        remaining_credits = remaining_credits - v_consume_from_this,
        updated_at = NOW()
      WHERE id = v_subscription_credit.id;
      
      v_consumed := v_consumed + v_consume_from_this;
      v_remaining_to_consume := v_remaining_to_consume - v_consume_from_this;
    END;
  END LOOP;

  -- 检查是否成功消费了所需的积分
  IF v_remaining_to_consume > 0 THEN
    RAISE EXCEPTION 'Failed to consume required credits. Remaining: %', v_remaining_to_consume;
  END IF;

  -- 计算新余额
  v_new_balance := v_user_balance.balance - p_amount;

  -- 更新积分余额
  UPDATE user_credit_balance
  SET 
    balance = v_new_balance,
    total_consumed = total_consumed + p_amount,
    updated_at = NOW()
  WHERE user_id = p_user_id;

  -- 生成交易ID
  v_transaction_id := gen_random_uuid()::TEXT;

  -- 记录交易
  INSERT INTO credit_transaction (
    id,
    user_id,
    amount,
    type,
    description,
    balance_after,
    metadata,
    created_at
  ) VALUES (
    v_transaction_id,
    p_user_id,
    -p_amount,
    'consumption',
    p_description,
    v_new_balance,
    jsonb_build_object(
      'consumedAmount', p_amount
    ),
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'transactionId', v_transaction_id,
    'balanceAfter', v_new_balance,
    'amountConsumed', p_amount
  );
END;
$$;

-- 3. 过期订阅积分的函数
CREATE OR REPLACE FUNCTION expire_subscription_credits()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expired_record RECORD;
  v_total_expired INTEGER := 0;
  v_users_affected INTEGER := 0;
  v_transaction_id TEXT;
BEGIN
  -- 查找并处理过期的订阅积分
  FOR v_expired_record IN
    SELECT 
      sc.*,
      ucb.balance
    FROM subscription_credits sc
    JOIN user_credit_balance ucb ON sc.user_id = ucb.user_id
    WHERE sc.status = 'active' 
      AND sc.end_date < NOW()
      AND sc.remaining_credits > 0
    FOR UPDATE OF sc, ucb
  LOOP
    -- 标记订阅积分为过期
    UPDATE subscription_credits
    SET 
      status = 'expired',
      updated_at = NOW()
    WHERE id = v_expired_record.id;

    -- 更新用户积分余额
    UPDATE user_credit_balance
    SET 
      balance = balance - v_expired_record.remaining_credits,
      updated_at = NOW()
    WHERE user_id = v_expired_record.user_id;

    -- 记录过期交易
    v_transaction_id := gen_random_uuid()::TEXT;
    INSERT INTO credit_transaction (
      id,
      user_id,
      type,
      amount,
      balance_after,
      description,
      related_subscription_id,
      metadata,
      created_at
    ) VALUES (
      v_transaction_id,
      v_expired_record.user_id,
      'expiration',
      -v_expired_record.remaining_credits,
      v_expired_record.balance - v_expired_record.remaining_credits,
      '订阅积分过期：' || v_expired_record.remaining_credits || '积分',
      v_expired_record.subscription_id,
      jsonb_build_object(
        'expiredCredits', v_expired_record.remaining_credits,
        'subscriptionPeriodEnd', v_expired_record.end_date,
        'expiredAt', NOW()
      ),
      NOW()
    );

    v_total_expired := v_total_expired + v_expired_record.remaining_credits;
    v_users_affected := v_users_affected + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'totalExpiredCredits', v_total_expired,
    'usersAffected', v_users_affected,
    'processedAt', NOW()
  );
END;
$$;

-- 4. 检查并自动过期积分的函数
CREATE OR REPLACE FUNCTION check_and_expire_credits(p_user_id TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 执行过期处理
  RETURN expire_subscription_credits();
END;
$$;

-- 5. 获取用户积分余额函数
CREATE OR REPLACE FUNCTION get_user_credits(p_user_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance_info RECORD;
  v_subscription_credits JSONB;
BEGIN
  SELECT 
    balance,
    total_recharged,
    total_consumed,
    created_at,
    updated_at
  INTO v_balance_info
  FROM user_credit_balance
  WHERE user_id = p_user_id;

  -- 获取活跃的订阅积分详情
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'subscriptionId', subscription_id,
        'credits', credits,
        'remainingCredits', remaining_credits,
        'startDate', start_date,
        'endDate', end_date,
        'status', status
      )
    ), 
    '[]'::jsonb
  ) INTO v_subscription_credits
  FROM subscription_credits
  WHERE user_id = p_user_id AND status = 'active';

  IF v_balance_info IS NULL THEN
    RETURN jsonb_build_object(
      'balance', 0,
      'totalRecharged', 0,
      'totalConsumed', 0,
      'subscriptionCredits', '[]'::jsonb,
      'exists', false
    );
  END IF;

  RETURN jsonb_build_object(
    'balance', v_balance_info.balance,
    'totalRecharged', v_balance_info.total_recharged,
    'totalConsumed', v_balance_info.total_consumed,
    'subscriptionCredits', v_subscription_credits,
    'createdAt', v_balance_info.created_at,
    'updatedAt', v_balance_info.updated_at,
    'exists', true
  );
END;
$$;

-- 6. 初始化新用户积分函数
CREATE OR REPLACE FUNCTION initialize_user_credits(
  p_user_id TEXT,
  p_initial_amount INTEGER DEFAULT 5
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transaction_id TEXT;
BEGIN
  -- 检查是否已存在积分记录
  IF EXISTS (SELECT 1 FROM user_credit_balance WHERE user_id = p_user_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'User credits already initialized'
    );
  END IF;

  -- 创建积分余额记录
  INSERT INTO user_credit_balance (
    id,
    user_id,
    balance,
    total_recharged,
    total_consumed,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid()::TEXT,
    p_user_id,
    p_initial_amount,
    p_initial_amount,
    0,
    NOW(),
    NOW()
  );

  -- 如果有初始积分，记录交易
  IF p_initial_amount > 0 THEN
    v_transaction_id := gen_random_uuid()::TEXT;
    INSERT INTO credit_transaction (
      id,
      user_id,
      amount,
      type,
      description,
      balance_after,
      created_at
    ) VALUES (
      v_transaction_id,
      p_user_id,
      p_initial_amount,
      'bonus',
      'Welcome bonus for new user',
      p_initial_amount,
      NOW()
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'transactionId', v_transaction_id,
    'initialBalance', p_initial_amount
  );
END;
$$;

-- 7. 添加奖励积分函数（绕过 RLS）
CREATE OR REPLACE FUNCTION add_bonus_credits_secure(
  p_user_id TEXT,
  p_amount INTEGER,
  p_description TEXT,
  p_metadata JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance_record user_credit_balance;
  v_new_balance INTEGER;
  v_transaction_id TEXT;
BEGIN
  -- 获取或创建用户积分余额记录
  SELECT * INTO v_balance_record
  FROM user_credit_balance
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_balance_record IS NULL THEN
    INSERT INTO user_credit_balance (
      id,
      user_id,
      balance,
      total_recharged,
      total_consumed,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid()::TEXT,
      p_user_id,
      p_amount,
      p_amount,
      0,
      NOW(),
      NOW()
    )
    RETURNING * INTO v_balance_record;
  ELSE
    -- 更新现有记录
    v_new_balance := v_balance_record.balance + p_amount;
    
    UPDATE user_credit_balance
    SET 
      balance = v_new_balance,
      total_recharged = total_recharged + p_amount,
      updated_at = NOW()
    WHERE id = v_balance_record.id;
    
    v_balance_record.balance := v_new_balance;
  END IF;

  -- 记录交易
  v_transaction_id := gen_random_uuid()::TEXT;
  
  INSERT INTO credit_transaction (
    id,
    user_id,
    type,
    amount,
    balance_after,
    description,
    metadata,
    created_at
  ) VALUES (
    v_transaction_id,
    p_user_id,
    'bonus',
    p_amount,
    v_balance_record.balance,
    p_description,
    p_metadata,
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_transaction_id,
    'balance', v_balance_record.balance,
    'amount_added', p_amount
  );
END;
$$;

-- 8. Webhook 相关辅助函数

-- 同步订阅状态
CREATE OR REPLACE FUNCTION sync_subscription(
  p_subscription_id TEXT,
  p_user_id TEXT,
  p_customer_id TEXT,
  p_product_id TEXT,
  p_price_id TEXT,
  p_status TEXT,
  p_current_period_start TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_current_period_end TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO stripe_subscription (
    id,
    user_id,
    customer_id,
    subscription_id,
    product_id,
    price_id,
    status,
    current_period_start,
    current_period_end,
    created_at,
    updated_at
  ) VALUES (
    p_subscription_id,
    p_user_id,
    p_customer_id,
    p_subscription_id,
    p_product_id,
    p_price_id,
    p_status,
    p_current_period_start,
    p_current_period_end,
    NOW(),
    NOW()
  )
  ON CONFLICT (subscription_id) 
  DO UPDATE SET
    user_id = EXCLUDED.user_id,
    customer_id = EXCLUDED.customer_id,
    product_id = EXCLUDED.product_id,
    price_id = EXCLUDED.price_id,
    status = EXCLUDED.status,
    current_period_start = EXCLUDED.current_period_start,
    current_period_end = EXCLUDED.current_period_end,
    updated_at = NOW();
END;
$$;

-- 插入待处理的积分奖励
CREATE OR REPLACE FUNCTION insert_pending_bonus_credits(
  p_user_id TEXT,
  p_amount INTEGER,
  p_description TEXT,
  p_metadata JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO pending_bonus_credits (
    id,
    user_id,
    amount,
    description,
    metadata,
    created_at,
    updated_at,
    status
  ) VALUES (
    gen_random_uuid()::TEXT,
    p_user_id,
    p_amount,
    p_description,
    p_metadata,
    NOW(),
    NOW(),
    'pending'
  );
END;
$$;

-- 9. 获取用户与 Stripe Customer ID 的关联
CREATE OR REPLACE FUNCTION get_user_by_stripe_customer(
  p_customer_id TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id TEXT;
BEGIN
  SELECT user_id INTO v_user_id
  FROM stripe_customer
  WHERE customer_id = p_customer_id;
  
  RETURN v_user_id;
END;
$$;

-- 10. 简化版积分操作函数（向后兼容）
CREATE OR REPLACE FUNCTION use_credits(
  p_user_id TEXT,
  p_amount INTEGER DEFAULT 1
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT consume_credits(p_user_id, p_amount, 'Face swap operation') INTO v_result;
  RETURN (v_result->>'success')::BOOLEAN;
EXCEPTION
  WHEN OTHERS THEN
    RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION get_credits(p_user_id TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance INTEGER;
BEGIN
  SELECT balance INTO v_balance
  FROM user_credit_balance
  WHERE user_id = p_user_id;
  
  -- 如果用户不存在，创建新用户记录
  IF v_balance IS NULL THEN
    PERFORM initialize_user_credits(p_user_id, 0);
    RETURN 0;
  END IF;
  
  RETURN v_balance;
END;
$$;

-- =================================================================
-- 创建定时任务处理过期积分的函数
-- =================================================================

-- 创建定时处理过期积分的函数（建议通过 cron 或应用程序调用）
CREATE OR REPLACE FUNCTION scheduled_expire_credits()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 调用过期积分处理函数
  RETURN expire_subscription_credits();
END;
$$;

-- =================================================================
-- 设置函数权限
-- =================================================================

-- 给 service_role 和 authenticated 用户执行权限
GRANT EXECUTE ON FUNCTION handle_subscription_payment_success TO service_role;
GRANT EXECUTE ON FUNCTION handle_subscription_payment_success TO authenticated;

GRANT EXECUTE ON FUNCTION consume_credits TO service_role;
GRANT EXECUTE ON FUNCTION consume_credits TO authenticated;

GRANT EXECUTE ON FUNCTION expire_subscription_credits TO service_role;

GRANT EXECUTE ON FUNCTION check_and_expire_credits TO service_role;
GRANT EXECUTE ON FUNCTION check_and_expire_credits TO authenticated;

GRANT EXECUTE ON FUNCTION get_user_credits TO service_role;
GRANT EXECUTE ON FUNCTION get_user_credits TO authenticated;

GRANT EXECUTE ON FUNCTION initialize_user_credits TO service_role;
GRANT EXECUTE ON FUNCTION initialize_user_credits TO authenticated;

GRANT EXECUTE ON FUNCTION add_bonus_credits_secure TO service_role;

GRANT EXECUTE ON FUNCTION sync_subscription TO service_role;
GRANT EXECUTE ON FUNCTION insert_pending_bonus_credits TO service_role;

GRANT EXECUTE ON FUNCTION get_user_by_stripe_customer TO service_role;
GRANT EXECUTE ON FUNCTION get_user_by_stripe_customer TO authenticated;

GRANT EXECUTE ON FUNCTION use_credits TO service_role;
GRANT EXECUTE ON FUNCTION use_credits TO authenticated;

GRANT EXECUTE ON FUNCTION get_credits TO service_role;
GRANT EXECUTE ON FUNCTION get_credits TO authenticated;

GRANT EXECUTE ON FUNCTION scheduled_expire_credits TO service_role; 