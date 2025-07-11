-- =================================================================
-- 实时积分计算方案 - 无需定时任务
-- =================================================================

-- 1. 创建一个只读视图，用于实时展示所有有效的订阅
-- 这个视图是计算用户有效积分的核心
CREATE OR REPLACE VIEW active_subscriptions_view AS
SELECT
  user_id,
  subscription_id,
  remaining_credits,
  end_date
FROM
  subscription_status_monitor
WHERE
  status = 'active' AND end_date > NOW();

-- 为视图添加注释，方便理解
COMMENT ON VIEW active_subscriptions_view IS '一个实时视图，只包含当前有效（未过期且状态为active）的订阅积分记录。';


-- 2. 创建一个函数，用于实时计算用户的总有效积分
-- 应用代码应调用此函数来获取用户余额，而不是直接查询 user_credit_balance 表
CREATE OR REPLACE FUNCTION get_user_balance_realtime(p_user_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE -- 标记为 STABLE 表示函数在单个事务中对相同输入返回相同结果
AS $$
  SELECT COALESCE(SUM(remaining_credits), 0)::INTEGER
  FROM active_subscriptions_view
  WHERE user_id = p_user_id;
$$;

-- 为函数添加注释
COMMENT ON FUNCTION get_user_balance_realtime(UUID) IS '实时计算并返回指定用户的总有效积分。它通过查询 active_subscriptions_view 来实现，无需依赖定时任务。';


-- 3. （可选但推荐）调整之前的函数，使其使用新的实时计算逻辑
-- 更新 add_credits_and_log_transaction 函数，使其在记录交易后返回实时计算的余额

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
  v_new_balance INTEGER;
  v_transaction_id UUID;
BEGIN
  -- 更新 user_credit_balance 表（作为历史记录和备份）
  INSERT INTO user_credit_balance (user_id, balance, total_recharged, updated_at)
  VALUES (p_user_id, 0, p_credits_to_add, NOW()) -- balance 字段不再是实时来源
  ON CONFLICT (user_id)
  DO UPDATE SET
    total_recharged = user_credit_balance.total_recharged + p_credits_to_add,
    updated_at = NOW();

  -- 记录积分交易
  INSERT INTO credit_transaction (
    user_id,
    amount,
    type,
    description,
    balance_after, -- 此处的余额是交易发生后的理论值
    metadata
  ) VALUES (
    p_user_id,
    p_credits_to_add,
    'recharge',
    p_description,
    (SELECT get_user_balance_realtime(p_user_id)) + p_credits_to_add, -- 理论新余额
    p_metadata
  ) RETURNING id INTO v_transaction_id;

  -- 获取最新的实时余额
  v_new_balance := get_user_balance_realtime(p_user_id);

  -- 更新 user_credit_balance 表的余额，使其与实时计算结果同步
  UPDATE user_credit_balance SET balance = v_new_balance WHERE user_id = p_user_id;

  -- 返回成功信息
  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'credits_added', p_credits_to_add,
    'balance_after', v_new_balance, -- 返回实时计算的余额
    'transaction_id', v_transaction_id
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error in add_credits_and_log_transaction for user %: %', p_user_id, SQLERRM;
    RETURN jsonb_build_object(
      'success', false,
      'message', SQLERRM
    );
END;
$$;
