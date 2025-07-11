-- =================================================================
-- 积分系统优化：原子化消费函数
-- 日期: 2025-07-11
-- 目的: 
-- 1. 创建一个新的、原子化的积分消费函数 `consume_credits_atomic`
-- 2. 确保积分消费操作的原子性，防止竞争条件
-- =================================================================

BEGIN;

-- 创建或替换 get_or_create_user_credit_balance 函数
CREATE OR REPLACE FUNCTION get_or_create_user_credit_balance(p_user_id UUID)
RETURNS user_credit_balance
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance_record user_credit_balance;
BEGIN
  -- 尝试获取现有记录
  SELECT * INTO v_balance_record
  FROM user_credit_balance
  WHERE user_id = p_user_id;

  -- 如果没有记录，创建一个
  IF v_balance_record IS NULL THEN
    INSERT INTO user_credit_balance (
      user_id,
      balance,
      total_recharged,
      total_consumed,
      created_at,
      updated_at
    ) VALUES (
      p_user_id,
      5, -- 默认给新用户5个积分
      5,
      0,
      NOW(),
      NOW()
    )
    RETURNING * INTO v_balance_record;
  END IF;

  RETURN v_balance_record;

EXCEPTION
  WHEN OTHERS THEN
    -- 如果出错，尝试再次获取
    SELECT * INTO v_balance_record
    FROM user_credit_balance
    WHERE user_id = p_user_id;
    
    RETURN v_balance_record;
END;
$$;

-- 创建新的原子化积分消费函数
CREATE OR REPLACE FUNCTION consume_credits_atomic(
  p_user_id UUID,
  p_amount INTEGER,
  p_description TEXT DEFAULT '积分消费'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance_record user_credit_balance;
  v_new_balance INTEGER;
  v_transaction_id UUID;
BEGIN
  -- 检查消费数量是否为正数
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', '消费数量必须为正数'
    );
  END IF;

  -- 在事务中锁定用户积分记录，防止并发更新
  SELECT * INTO v_balance_record
  FROM user_credit_balance
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- 如果用户没有积分记录，先创建
  IF v_balance_record IS NULL THEN
    v_balance_record := get_or_create_user_credit_balance(p_user_id);
  END IF;

  -- 检查积分是否足够
  IF v_balance_record.balance < p_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', '积分不足',
      'balance', v_balance_record.balance,
      'required', p_amount
    );
  END IF;

  -- 计算新余额
  v_new_balance := v_balance_record.balance - p_amount;

  -- 更新积分余额
  UPDATE user_credit_balance
  SET 
    balance = v_new_balance,
    total_consumed = total_consumed + p_amount,
    updated_at = NOW()
  WHERE user_id = p_user_id;

  -- 记录交易
  INSERT INTO credit_transaction (
    user_id,
    amount,
    type,
    description,
    balance_after,
    created_at
  ) VALUES (
    p_user_id,
    -p_amount,
    'consumption',
    p_description,
    v_new_balance,
    NOW()
  ) RETURNING id INTO v_transaction_id;

  RETURN jsonb_build_object(
    'success', true,
    'balanceAfter', v_new_balance,
    'amountConsumed', p_amount,
    'transactionId', v_transaction_id,
    'message', '积分消费成功'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- 创建新的原子化奖励积分函数
CREATE OR REPLACE FUNCTION add_bonus_credits_v2(
  p_user_id UUID,
  bonus_amount INTEGER,
  bonus_reason TEXT,
  bonus_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance_record user_credit_balance;
  v_new_balance INTEGER;
  v_transaction_id UUID;
BEGIN
  -- 检查奖励数量是否为正数
  IF bonus_amount <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', '奖励积分必须为正数'
    );
  END IF;

  -- 在事务中锁定用户积分记录
  SELECT * INTO v_balance_record
  FROM user_credit_balance
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- 如果用户没有积分记录，先创建
  IF v_balance_record IS NULL THEN
    v_balance_record := get_or_create_user_credit_balance(p_user_id);
  END IF;

  -- 计算新余额
  v_new_balance := v_balance_record.balance + bonus_amount;

  -- 更新积分余额
  UPDATE user_credit_balance
  SET 
    balance = v_new_balance,
    total_recharged = v_balance_record.total_recharged + bonus_amount,
    updated_at = NOW()
  WHERE user_id = p_user_id;

  -- 记录交易
  INSERT INTO credit_transaction (
    user_id,
    amount,
    type,
    description,
    balance_after,
    metadata,
    created_at
  ) VALUES (
    p_user_id,
    bonus_amount,
    'bonus',
    bonus_reason,
    v_new_balance,
    bonus_metadata,
    NOW()
  ) RETURNING id INTO v_transaction_id;

  RETURN jsonb_build_object(
    'success', true,
    'balanceAfter', v_new_balance,
    'amountAdded', bonus_amount,
    'transactionId', v_transaction_id,
    'message', '奖励积分添加成功'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

COMMIT;

-- 输出最终成功信息
SELECT 
    '🎉 积分系统优化完成！' as status,
    '已创建原子化积分消费函数 consume_credits_atomic' as details,
    NOW() as completed_at;