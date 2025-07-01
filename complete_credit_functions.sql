-- =================================================================
-- 完整版积分系统数据库函数
-- 基于 user_credit_balance, credit_transaction 等完整表结构
-- =================================================================

-- 1. 创建或获取用户积分余额记录
CREATE OR REPLACE FUNCTION get_or_create_user_credit_balance(user_id TEXT)
RETURNS user_credit_balance
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  balance_record user_credit_balance;
BEGIN
  -- 尝试获取现有记录
  SELECT * INTO balance_record
  FROM user_credit_balance
  WHERE user_credit_balance.user_id = get_or_create_user_credit_balance.user_id;

  -- 如果记录不存在，创建新记录并赠送5积分
  IF balance_record IS NULL THEN
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
      get_or_create_user_credit_balance.user_id,
      5, -- 新用户赠送5积分
      5, -- 记录为充值（赠送）
      0,
      NOW(),
      NOW()
    ) RETURNING * INTO balance_record;

    -- 记录赠送积分的交易
    INSERT INTO credit_transaction (
      id,
      user_id,
      type,
      amount,
      balance_after,
      description,
      created_at
    ) VALUES (
      gen_random_uuid()::TEXT,
      get_or_create_user_credit_balance.user_id,
      'bonus',
      5,
      5,
      '新用户注册赠送积分',
      NOW()
    );
  END IF;

  RETURN balance_record;
END;
$$;

-- 2. 消费积分函数（完整版）
CREATE OR REPLACE FUNCTION consume_credits_v2(
  user_id TEXT,
  action_type TEXT DEFAULT 'face_swap',
  amount_override INTEGER DEFAULT NULL,
  transaction_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  balance_record user_credit_balance;
  consumption_config credit_consumption_config;
  credits_required INTEGER;
  new_balance INTEGER;
  transaction_id TEXT;
  final_description TEXT;
BEGIN
  -- 获取或创建用户积分余额
  balance_record := get_or_create_user_credit_balance(user_id);

  -- 获取操作所需积分配置
  SELECT * INTO consumption_config
  FROM credit_consumption_config
  WHERE credit_consumption_config.action_type = consume_credits_v2.action_type
    AND is_active = true;

  -- 确定所需积分数量
  IF amount_override IS NOT NULL THEN
    credits_required := amount_override;
  ELSIF consumption_config IS NOT NULL THEN
    credits_required := consumption_config.credits_required;
  ELSE
    -- 默认消费1积分
    credits_required := 1;
  END IF;

  -- 检查积分是否充足
  IF balance_record.balance < credits_required THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'insufficient_credits',
      'message', '积分不足',
      'currentBalance', balance_record.balance,
      'required', credits_required
    );
  END IF;

  -- 计算新余额
  new_balance := balance_record.balance - credits_required;

  -- 更新用户积分余额
  UPDATE user_credit_balance
  SET 
    balance = new_balance,
    total_consumed = total_consumed + credits_required,
    updated_at = NOW()
  WHERE user_credit_balance.user_id = consume_credits_v2.user_id;

  -- 生成交易ID和描述
  transaction_id := gen_random_uuid()::TEXT;
  final_description := COALESCE(
    transaction_description,
    consumption_config.description,
    action_type || ' 操作消费积分'
  );

  -- 记录交易
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
    transaction_id,
    consume_credits_v2.user_id,
    'consumption',
    -credits_required,
    new_balance,
    final_description,
    jsonb_build_object('actionType', action_type),
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'transactionId', transaction_id,
    'balanceAfter', new_balance,
    'amountConsumed', credits_required,
    'actionType', action_type
  );
END;
$$;

-- 3. 充值积分函数（完整版）
CREATE OR REPLACE FUNCTION recharge_credits_v2(
  user_id TEXT,
  amount_to_add INTEGER,
  payment_intent_id TEXT DEFAULT NULL,
  recharge_id TEXT DEFAULT NULL,
  transaction_description TEXT DEFAULT '积分充值'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  balance_record user_credit_balance;
  new_balance INTEGER;
  transaction_id TEXT;
  final_recharge_id TEXT;
BEGIN
  -- 获取或创建用户积分余额
  balance_record := get_or_create_user_credit_balance(user_id);

  -- 计算新余额
  new_balance := balance_record.balance + amount_to_add;

  -- 更新用户积分余额
  UPDATE user_credit_balance
  SET 
    balance = new_balance,
    total_recharged = total_recharged + amount_to_add,
    updated_at = NOW()
  WHERE user_credit_balance.user_id = recharge_credits_v2.user_id;

  -- 生成交易ID
  transaction_id := gen_random_uuid()::TEXT;
  final_recharge_id := COALESCE(recharge_id, gen_random_uuid()::TEXT);

  -- 记录交易
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
  ) VALUES (
    transaction_id,
    recharge_credits_v2.user_id,
    'recharge',
    amount_to_add,
    new_balance,
    transaction_description,
    final_recharge_id,
    jsonb_build_object('paymentIntentId', payment_intent_id),
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'transactionId', transaction_id,
    'rechargeId', final_recharge_id,
    'balanceAfter', new_balance,
    'amountAdded', amount_to_add
  );
END;
$$;

-- 4. 获取用户积分余额函数
CREATE OR REPLACE FUNCTION get_user_credits_v2(user_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  balance_record user_credit_balance;
BEGIN
  -- 获取或创建用户积分余额
  balance_record := get_or_create_user_credit_balance(user_id);

  RETURN jsonb_build_object(
    'balance', balance_record.balance,
    'totalRecharged', balance_record.total_recharged,
    'totalConsumed', balance_record.total_consumed,
    'createdAt', balance_record.created_at,
    'updatedAt', balance_record.updated_at
  );
END;
$$;

-- 5. 插入默认积分消费配置
INSERT INTO credit_consumption_config (
  id,
  action_type,
  credits_required,
  description,
  is_active,
  created_at,
  updated_at
) VALUES 
(
  gen_random_uuid()::TEXT,
  'face_swap',
  1,
  '人脸交换操作',
  true,
  NOW(),
  NOW()
),
(
  gen_random_uuid()::TEXT,
  'image_enhance',
  1,
  '图像增强操作',
  true,
  NOW(),
  NOW()
),
(
  gen_random_uuid()::TEXT,
  'background_remove',
  1,
  '背景移除操作',
  true,
  NOW(),
  NOW()
);

-- 6. 插入默认积分套餐（与定价页面保持一致）
INSERT INTO credit_package (
  id,
  name,
  description,
  credits,
  price,
  currency,
  is_active,
  is_popular,
  sort_order,
  created_at,
  updated_at
) VALUES 
(
  gen_random_uuid()::TEXT,
  'Monthly',
  'Face swap for 120 images; No watermark; Priority processing; Email support',
  120,
  1690, -- $16.90
  'usd',
  true,
  false,
  1,
  NOW(),
  NOW()
),
(
  gen_random_uuid()::TEXT,
  'Yearly',
  'Face swap for 1800 images per year; No watermark; Priority processing; Email support',
  1800,
  990, -- $9.90 (monthly equivalent of $118.8/year)
  'usd',
  true,
  true, -- 标记为热门套餐
  2,
  NOW(),
  NOW()
); 