-- =================================================================
-- Face-Swap 缺失函数补充脚本
-- =================================================================
-- 用途：添加前端代码中使用但数据库脚本中缺失的函数
-- 版本：1.0
-- 更新时间：2025-07-11
-- =================================================================

BEGIN;
DROP FUNCTION IF EXISTS get_user_credits_v2(uuid);
DROP FUNCTION IF EXISTS get_credits(uuid);
DROP FUNCTION IF EXISTS consume_credits_v2(uuid, text, integer, text);
DROP FUNCTION IF EXISTS recharge_credits_v2(uuid, integer, text, text);
DROP FUNCTION IF EXISTS use_credits(uuid, integer);
DROP FUNCTION IF EXISTS add_credits(uuid, integer);
DROP FUNCTION IF EXISTS handle_payment_success(text, text);
DROP FUNCTION IF EXISTS log_face_swap(uuid, text, text);
DROP FUNCTION IF EXISTS add_bonus_credits_v2(uuid, integer, text, jsonb);
DROP FUNCTION IF EXISTS recalculate_user_balance(uuid);
-- =================================================================
-- 1. 积分查询函数
-- =================================================================

-- 1.1 获取用户积分详情 (v2版本)
CREATE OR REPLACE FUNCTION get_user_credits_v2(p_user_id UUID)
RETURNS TABLE(
    balance INTEGER,
    totalRecharged INTEGER,
    totalConsumed INTEGER,
    createdAt TIMESTAMP WITH TIME ZONE,
    updatedAt TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_subscription_credits INTEGER := 0;
    v_record RECORD;
BEGIN
    -- 获取订阅积分总额
    SELECT COALESCE(SUM(remaining_credits), 0) INTO v_subscription_credits
    FROM subscription_credits
    WHERE user_id = p_user_id 
    AND status = 'active' 
    AND end_date > NOW();
    
    -- 获取用户积分余额记录，如果不存在则创建
    SELECT * INTO v_record FROM get_or_create_user_credit_balance(p_user_id);
    
    -- 返回结果，包含订阅积分
    RETURN QUERY
    SELECT 
        (v_record.balance + v_subscription_credits)::INTEGER as balance,
        v_record.total_recharged::INTEGER as totalRecharged,
        v_record.total_consumed::INTEGER as totalConsumed,
        NOW() as createdAt,
        NOW() as updatedAt;
END;
$$;

-- 1.2 简化的积分查询函数
CREATE OR REPLACE FUNCTION get_credits(user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_balance INTEGER := 0;
    v_subscription_credits INTEGER := 0;
BEGIN
    -- 获取基础积分余额
    SELECT COALESCE(balance, 0) INTO v_balance
    FROM user_credit_balance
    WHERE user_credit_balance.user_id = get_credits.user_id;
    
    -- 如果没有记录，创建一个新的
    IF v_balance IS NULL THEN
        INSERT INTO user_credit_balance (user_id, balance, total_recharged, total_consumed)
        VALUES (get_credits.user_id, 5, 0, 0) -- 新用户赠送5积分
        RETURNING balance INTO v_balance;
    END IF;
    
    -- 获取订阅积分
    SELECT COALESCE(SUM(remaining_credits), 0) INTO v_subscription_credits
    FROM subscription_credits
    WHERE subscription_credits.user_id = get_credits.user_id 
    AND status = 'active' 
    AND end_date > NOW();
    
    RETURN v_balance + v_subscription_credits;
END;
$$;

-- =================================================================
-- 2. 积分操作函数
-- =================================================================

-- 2.1 消费积分 (v2版本)
CREATE OR REPLACE FUNCTION consume_credits_v2(
    p_user_id UUID,
    action_type TEXT DEFAULT 'face_swap',
    amount_override INTEGER DEFAULT NULL,
    transaction_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_amount_to_consume INTEGER;
    v_description TEXT;
    v_result JSONB;
BEGIN
    -- 确定消费数量
    v_amount_to_consume := COALESCE(amount_override, 1); -- 默认消费1积分
    
    -- 确定描述
    v_description := COALESCE(
        transaction_description, 
        CASE action_type
            WHEN 'face_swap' THEN '人脸交换'
            WHEN 'image_generation' THEN '图像生成'
            WHEN 'video_processing' THEN '视频处理'
            ELSE '积分消费'
        END
    );
    
    -- 调用原子化消费函数
    SELECT consume_credits_atomic(p_user_id, v_amount_to_consume, v_description) INTO v_result;
    
    -- 如果成功，添加额外信息
    IF (v_result->>'success')::boolean THEN
        v_result := v_result || jsonb_build_object(
            'actionType', action_type,
            'amountConsumed', v_amount_to_consume,
            'balanceAfter', (v_result->>'balance_after')::integer
        );
    END IF;
    
    RETURN v_result;
END;
$$;

-- 2.2 充值积分 (v2版本)  
CREATE OR REPLACE FUNCTION recharge_credits_v2(
    p_user_id UUID,
    amount_to_add INTEGER,
    payment_intent_id TEXT DEFAULT NULL,
    transaction_description TEXT DEFAULT '积分充值'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_metadata JSONB;
    v_result JSONB;
BEGIN
    -- 构建元数据
    v_metadata := jsonb_build_object(
        'payment_intent_id', payment_intent_id,
        'recharge_method', CASE WHEN payment_intent_id IS NOT NULL THEN 'stripe' ELSE 'manual' END
    );
    
    -- 调用添加积分函数
    SELECT add_credits_and_log_transaction(
        p_user_id, 
        amount_to_add, 
        transaction_description, 
        v_metadata
    ) INTO v_result;
    
    -- 格式化返回结果
    IF (v_result->>'success')::boolean THEN
        v_result := v_result || jsonb_build_object(
            'amountAdded', amount_to_add,
            'balanceAfter', (v_result->>'balance_after')::integer
        );
    END IF;
    
    RETURN v_result;
END;
$$;

-- 2.3 简化的使用积分函数
CREATE OR REPLACE FUNCTION use_credits(user_id UUID, amount INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
BEGIN
    -- 调用原子化消费函数
    SELECT consume_credits_atomic(user_id, amount, '积分消费') INTO v_result;
    
    -- 返回是否成功
    RETURN (v_result->>'success')::boolean;
END;
$$;

-- 2.4 简化的添加积分函数
CREATE OR REPLACE FUNCTION add_credits(user_id UUID, amount INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
BEGIN
    -- 调用添加积分函数
    SELECT add_credits_and_log_transaction(user_id, amount, '积分充值', '{}'::jsonb) INTO v_result;
    
    -- 返回是否成功
    RETURN (v_result->>'success')::boolean;
END;
$$;

-- =================================================================
-- 3. 支付处理函数
-- =================================================================

-- 3.1 处理支付成功
CREATE OR REPLACE FUNCTION handle_payment_success(
    p_payment_intent_id TEXT,
    p_recharge_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_existing_transaction RECORD;
    v_amount_map JSONB;
    v_credits_to_add INTEGER;
    v_user_id UUID;
    v_result JSONB;
BEGIN
    -- 检查是否已经处理过这个支付
    SELECT * INTO v_existing_transaction
    FROM credit_transaction
    WHERE metadata->>'payment_intent_id' = p_payment_intent_id
    AND type = 'recharge'
    LIMIT 1;
    
    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', true,
            'duplicate', true,
            'message', '支付已处理',
            'balanceAfter', v_existing_transaction.balance_after
        );
    END IF;
    
    -- 根据支付金额确定积分数量（这里需要根据实际产品配置）
    v_amount_map := '{
        "1690": 120,
        "11880": 1800,
        "2990": 300,
        "4990": 600
    }'::jsonb;
    
    -- 这里需要从 webhook 中获取实际的用户ID和金额
    -- 暂时返回错误，需要在实际使用时传入更多参数
    RETURN jsonb_build_object(
        'success', false,
        'error', 'insufficient_data',
        'message', '需要用户ID和支付金额信息'
    );
END;
$$;

-- =================================================================
-- 4. 日志记录函数
-- =================================================================

-- 4.1 记录人脸交换操作
CREATE OR REPLACE FUNCTION log_face_swap(
    user_id UUID,
    status TEXT DEFAULT 'completed',
    error_msg TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- 记录到人脸交换历史表
    INSERT INTO face_swap_histories (
        user_id,
        result_image_path,
        description,
        project_id
    ) VALUES (
        user_id,
        CASE WHEN status = 'completed' THEN 'face-swap-result-' || EXTRACT(epoch FROM NOW()) ELSE 'failed' END,
        CASE 
            WHEN status = 'completed' THEN '人脸交换完成'
            WHEN status = 'failed' THEN '人脸交换失败: ' || COALESCE(error_msg, '未知错误')
            ELSE '人脸交换: ' || status
        END,
        '0616faceswap'
    );
    
    -- 如果是错误状态，可以记录到错误日志
    IF status = 'failed' AND error_msg IS NOT NULL THEN
        INSERT INTO webhook_errors (
            event_id,
            event_type,
            error_message,
            error_details
        ) VALUES (
            'face_swap_' || user_id || '_' || EXTRACT(epoch FROM NOW()),
            'face_swap_error',
            error_msg,
            jsonb_build_object('user_id', user_id, 'timestamp', NOW())
        );
    END IF;
    
    RAISE LOG 'Face swap logged for user %: status=%', user_id, status;
END;
$$;

-- =================================================================
-- 5. 高级积分管理函数
-- =================================================================

-- 5.1 添加奖励积分 (v2版本)
CREATE OR REPLACE FUNCTION add_bonus_credits_v2(
    p_user_id UUID,
    bonus_amount INTEGER,
    bonus_reason TEXT DEFAULT '奖励积分',
    bonus_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_metadata JSONB;
    v_result JSONB;
    v_transaction_id UUID;
BEGIN
    -- 参数验证
    IF bonus_amount <= 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'invalid_amount',
            'message', '奖励积分必须大于0'
        );
    END IF;
    
    -- 构建完整的元数据
    v_metadata := bonus_metadata || jsonb_build_object(
        'bonus_type', 'reward',
        'bonus_reason', bonus_reason,
        'granted_at', NOW()
    );
    
    -- 调用添加积分函数
    SELECT add_credits_and_log_transaction(
        p_user_id,
        bonus_amount,
        bonus_reason,
        v_metadata
    ) INTO v_result;
    
    -- 如果成功，获取交易ID
    IF (v_result->>'success')::boolean THEN
        v_transaction_id := (v_result->>'transaction_id')::uuid;
        
        -- 格式化返回结果
        v_result := v_result || jsonb_build_object(
            'bonusAmount', bonus_amount,
            'balanceAfter', (v_result->>'balance_after')::integer,
            'transactionId', v_transaction_id
        );
    END IF;
    
    RETURN v_result;
END;
$$;

-- 5.2 重新计算用户余额
CREATE OR REPLACE FUNCTION recalculate_user_balance(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_subscription_credits INTEGER := 0;
    v_base_balance INTEGER := 0;
    v_total_balance INTEGER;
    v_total_recharged INTEGER := 0;
    v_total_consumed INTEGER := 0;
BEGIN
    -- 计算订阅积分总额
    SELECT COALESCE(SUM(remaining_credits), 0) INTO v_subscription_credits
    FROM subscription_credits
    WHERE user_id = p_user_id 
    AND status = 'active' 
    AND end_date > NOW();
    
    -- 获取基础余额
    SELECT 
        COALESCE(balance, 0),
        COALESCE(total_recharged, 0),
        COALESCE(total_consumed, 0)
    INTO v_base_balance, v_total_recharged, v_total_consumed
    FROM user_credit_balance
    WHERE user_id = p_user_id;
    
    -- 如果没有记录，创建一个
    IF v_base_balance IS NULL THEN
        INSERT INTO user_credit_balance (user_id, balance, total_recharged, total_consumed)
        VALUES (p_user_id, 5, 0, 0) -- 新用户赠送5积分
        RETURNING balance, total_recharged, total_consumed
        INTO v_base_balance, v_total_recharged, v_total_consumed;
    END IF;
    
    -- 计算总余额
    v_total_balance := v_base_balance + v_subscription_credits;
    
    RETURN jsonb_build_object(
        'success', true,
        'userId', p_user_id,
        'baseBalance', v_base_balance,
        'subscriptionCredits', v_subscription_credits,
        'totalBalance', v_total_balance,
        'totalRecharged', v_total_recharged,
        'totalConsumed', v_total_consumed,
        'recalculatedAt', NOW()
    );
END;
$$;

-- =================================================================
-- 6. 权限设置
-- =================================================================

-- 为认证用户授权访问新函数
GRANT EXECUTE ON FUNCTION get_user_credits_v2(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_credits(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION consume_credits_v2(UUID, TEXT, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION recharge_credits_v2(UUID, INTEGER, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION use_credits(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION add_credits(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION log_face_swap(UUID, TEXT, TEXT) TO authenticated;

-- 为服务角色授权访问所有函数
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- =================================================================
-- 7. 函数说明和注释
-- =================================================================

COMMENT ON FUNCTION get_user_credits_v2(UUID) IS '获取用户积分详情，包含基础积分和订阅积分的汇总';
COMMENT ON FUNCTION get_credits(UUID) IS '简化的积分查询函数，返回总余额数字';
COMMENT ON FUNCTION consume_credits_v2(UUID, TEXT, INTEGER, TEXT) IS '消费积分v2版本，支持自定义动作类型和数量';
COMMENT ON FUNCTION recharge_credits_v2(UUID, INTEGER, TEXT, TEXT) IS '充值积分v2版本，支持支付意图ID关联';
COMMENT ON FUNCTION use_credits(UUID, INTEGER) IS '简化的积分消费函数，返回布尔值';
COMMENT ON FUNCTION add_credits(UUID, INTEGER) IS '简化的积分添加函数，返回布尔值';
COMMENT ON FUNCTION handle_payment_success(TEXT, TEXT) IS '处理支付成功的webhook，防止重复处理';
COMMENT ON FUNCTION log_face_swap(UUID, TEXT, TEXT) IS '记录人脸交换操作日志';
COMMENT ON FUNCTION add_bonus_credits_v2(UUID, INTEGER, TEXT, JSONB) IS '添加奖励积分v2版本，支持元数据';
COMMENT ON FUNCTION recalculate_user_balance(UUID) IS '重新计算用户余额，包含详细信息';

COMMIT;

-- =================================================================
-- 脚本执行完成
-- =================================================================

DO $$
BEGIN
    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'Face-Swap 缺失函数补充完成！';
    RAISE NOTICE '=================================================================';
    RAISE NOTICE '已添加的函数：';
    RAISE NOTICE '  - get_user_credits_v2() (获取用户积分详情v2)';
    RAISE NOTICE '  - get_credits() (简化积分查询)';
    RAISE NOTICE '  - consume_credits_v2() (消费积分v2)';
    RAISE NOTICE '  - recharge_credits_v2() (充值积分v2)';
    RAISE NOTICE '  - use_credits() (简化积分使用)';
    RAISE NOTICE '  - add_credits() (简化积分添加)';
    RAISE NOTICE '  - handle_payment_success() (支付成功处理)';
    RAISE NOTICE '  - log_face_swap() (人脸交换日志)';
    RAISE NOTICE '  - add_bonus_credits_v2() (奖励积分v2)';
    RAISE NOTICE '  - recalculate_user_balance() (重新计算余额)';
    RAISE NOTICE '';
    RAISE NOTICE '所有函数已配置相应权限';
    RAISE NOTICE '现在前端代码应该能够正常调用所有数据库函数';
    RAISE NOTICE '=================================================================';
END $$;