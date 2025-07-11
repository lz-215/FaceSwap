-- 数据库函数：安全地增加用户积分并记录交易
-- 该函数确保积分操作的原子性

CREATE OR REPLACE FUNCTION add_credits_and_log_transaction(
  p_user_id UUID,
  p_credits_to_add INTEGER,
  p_description TEXT,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_balance INTEGER;
  v_new_balance INTEGER;
  v_transaction_id UUID;
BEGIN
  -- 锁定用户余额记录，防止并发问题
  SELECT balance INTO v_current_balance
  FROM user_credit_balance
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- 如果用户没有余额记录，则初始化
  IF NOT FOUND THEN
    v_current_balance := 0;
    INSERT INTO user_credit_balance(user_id, balance)
    VALUES (p_user_id, 0);
  END IF;

  -- 计算新余额
  v_new_balance := v_current_balance + p_credits_to_add;

  -- 更新用户余额
  UPDATE user_credit_balance
  SET
    balance = v_new_balance,
    total_recharged = COALESCE(total_recharged, 0) + p_credits_to_add,
    updated_at = NOW()
  WHERE user_id = p_user_id;

  -- 记录积分交易
  INSERT INTO credit_transaction (
    user_id,
    amount,
    type,
    description,
    balance_after,
    metadata
  ) VALUES (
    p_user_id,
    p_credits_to_add,
    'recharge',
    p_description,
    v_new_balance,
    p_metadata
  ) RETURNING id INTO v_transaction_id;

  -- 返回成功信息
  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'credits_added', p_credits_to_add,
    'balance_after', v_new_balance,
    'transaction_id', v_transaction_id
  );

EXCEPTION
  WHEN OTHERS THEN
    -- 记录错误并返回失败信息
    RAISE WARNING 'Error in add_credits_and_log_transaction for user %: %', p_user_id, SQLERRM;
    RETURN jsonb_build_object(
      'success', false,
      'message', SQLERRM
    );
END;
$$;
