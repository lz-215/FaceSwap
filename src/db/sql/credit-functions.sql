-- 消费积分函数
CREATE OR REPLACE FUNCTION consume_credits(
  user_id TEXT,
  amount_to_consume INTEGER,
  transaction_description TEXT DEFAULT 'Credit consumption'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_balance INTEGER;
  new_balance INTEGER;
  transaction_id TEXT;
BEGIN
  -- 锁定用户积分记录
  SELECT balance INTO current_balance
  FROM user_credit_balance
  WHERE "userId" = user_id
  FOR UPDATE;

  -- 检查积分是否充足
  IF current_balance IS NULL THEN
    RAISE EXCEPTION 'User credit balance not found';
  END IF;

  IF current_balance < amount_to_consume THEN
    RAISE EXCEPTION 'Insufficient credits. Current balance: %, Required: %', current_balance, amount_to_consume;
  END IF;

  -- 计算新余额
  new_balance := current_balance - amount_to_consume;

  -- 更新积分余额
  UPDATE user_credit_balance
  SET 
    balance = new_balance,
    "totalConsumed" = "totalConsumed" + amount_to_consume,
    "updatedAt" = NOW()
  WHERE "userId" = user_id;

  -- 生成交易ID
  transaction_id := gen_random_uuid()::TEXT;

  -- 记录交易
  INSERT INTO credit_transaction (
    id,
    "userId",
    amount,
    type,
    description,
    "balanceAfter",
    "createdAt"
  ) VALUES (
    transaction_id,
    user_id,
    -amount_to_consume,
    'consumption',
    transaction_description,
    new_balance,
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'transactionId', transaction_id,
    'balanceAfter', new_balance,
    'amountConsumed', amount_to_consume
  );
END;
$$;

-- 充值积分函数
CREATE OR REPLACE FUNCTION recharge_credits(
  user_id TEXT,
  amount_to_add INTEGER,
  payment_intent_id TEXT DEFAULT NULL,
  transaction_description TEXT DEFAULT 'Credit recharge'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_balance INTEGER;
  new_balance INTEGER;
  transaction_id TEXT;
BEGIN
  -- 锁定用户积分记录
  SELECT balance INTO current_balance
  FROM user_credit_balance
  WHERE "userId" = user_id
  FOR UPDATE;

  -- 如果用户积分记录不存在，创建新记录
  IF current_balance IS NULL THEN
    INSERT INTO user_credit_balance (
      id,
      "userId",
      balance,
      "totalRecharged",
      "totalConsumed",
      "createdAt",
      "updatedAt"
    ) VALUES (
      gen_random_uuid()::TEXT,
      user_id,
      amount_to_add,
      amount_to_add,
      0,
      NOW(),
      NOW()
    );
    current_balance := 0;
    new_balance := amount_to_add;
  ELSE
    -- 计算新余额
    new_balance := current_balance + amount_to_add;

    -- 更新积分余额
    UPDATE user_credit_balance
    SET 
      balance = new_balance,
      "totalRecharged" = "totalRecharged" + amount_to_add,
      "updatedAt" = NOW()
    WHERE "userId" = user_id;
  END IF;

  -- 生成交易ID
  transaction_id := gen_random_uuid()::TEXT;

  -- 记录交易
  INSERT INTO credit_transaction (
    id,
    "userId",
    amount,
    type,
    description,
    "balanceAfter",
    "createdAt",
    metadata
  ) VALUES (
    transaction_id,
    user_id,
    amount_to_add,
    'recharge',
    transaction_description,
    new_balance,
    NOW(),
    CASE 
      WHEN payment_intent_id IS NOT NULL 
      THEN jsonb_build_object('paymentIntentId', payment_intent_id)
      ELSE NULL
    END
  );

  RETURN jsonb_build_object(
    'success', true,
    'transactionId', transaction_id,
    'balanceAfter', new_balance,
    'amountAdded', amount_to_add
  );
END;
$$;

-- 获取用户积分余额函数
CREATE OR REPLACE FUNCTION get_user_credits(user_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  balance_info RECORD;
BEGIN
  SELECT 
    balance,
    "totalRecharged",
    "totalConsumed",
    "createdAt",
    "updatedAt"
  INTO balance_info
  FROM user_credit_balance
  WHERE "userId" = user_id;

  IF balance_info IS NULL THEN
    RETURN jsonb_build_object(
      'balance', 0,
      'totalRecharged', 0,
      'totalConsumed', 0,
      'exists', false
    );
  END IF;

  RETURN jsonb_build_object(
    'balance', balance_info.balance,
    'totalRecharged', balance_info."totalRecharged",
    'totalConsumed', balance_info."totalConsumed",
    'createdAt', balance_info."createdAt",
    'updatedAt', balance_info."updatedAt",
    'exists', true
  );
END;
$$;

-- 初始化新用户积分函数
CREATE OR REPLACE FUNCTION initialize_user_credits(
  user_id TEXT,
  initial_amount INTEGER DEFAULT 5
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  transaction_id TEXT;
BEGIN
  -- 检查是否已存在积分记录
  IF EXISTS (SELECT 1 FROM user_credit_balance WHERE "userId" = user_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'User credits already initialized'
    );
  END IF;

  -- 创建积分余额记录
  INSERT INTO user_credit_balance (
    id,
    "userId",
    balance,
    "totalRecharged",
    "totalConsumed",
    "createdAt",
    "updatedAt"
  ) VALUES (
    gen_random_uuid()::TEXT,
    user_id,
    initial_amount,
    initial_amount,
    0,
    NOW(),
    NOW()
  );

  -- 生成交易ID
  transaction_id := gen_random_uuid()::TEXT;

  -- 记录初始积分交易
  INSERT INTO credit_transaction (
    id,
    "userId",
    amount,
    type,
    description,
    "balanceAfter",
    "createdAt"
  ) VALUES (
    transaction_id,
    user_id,
    initial_amount,
    'bonus',
    'Welcome bonus for new user',
    initial_amount,
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'transactionId', transaction_id,
    'initialBalance', initial_amount
  );
END;
$$; 