-- =================================================================
-- 修复RLS问题和添加缺失的数据库函数
-- 解决积分分配失败问题
-- =================================================================

BEGIN;

-- 1. 创建recharge_credits_v2函数（添加积分）
CREATE OR REPLACE FUNCTION recharge_credits_v2(
    p_user_id UUID,
    amount_to_add INTEGER,
    payment_intent_id TEXT DEFAULT NULL,
    transaction_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_balance_record user_credit_balance;
    v_new_balance INTEGER;
    v_description TEXT := COALESCE(transaction_description, '充值积分');
    v_transaction_id UUID;
BEGIN
    -- 获取或创建用户积分记录
    SELECT * INTO v_balance_record
    FROM user_credit_balance
    WHERE user_id = p_user_id;

    IF v_balance_record IS NULL THEN
        -- 创建新的积分记录
        INSERT INTO user_credit_balance (
            user_id,
            balance,
            total_recharged,
            total_consumed,
            created_at,
            updated_at
        ) VALUES (
            p_user_id,
            amount_to_add,
            amount_to_add,
            0,
            NOW(),
            NOW()
        )
        RETURNING * INTO v_balance_record;
        
        v_new_balance := amount_to_add;
    ELSE
        -- 更新现有余额
        v_new_balance := v_balance_record.balance + amount_to_add;
        
        UPDATE user_credit_balance
        SET 
            balance = v_new_balance,
            total_recharged = total_recharged + amount_to_add,
            updated_at = NOW()
        WHERE id = v_balance_record.id;
    END IF;

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
        amount_to_add,
        'recharge',
        v_description,
        v_new_balance,
        CASE 
            WHEN payment_intent_id IS NOT NULL 
            THEN jsonb_build_object('payment_intent_id', payment_intent_id)
            ELSE '{}'::jsonb
        END,
        NOW()
    )
    RETURNING id INTO v_transaction_id;

    RETURN jsonb_build_object(
        'success', true,
        'balanceAfter', v_new_balance,
        'amountAdded', amount_to_add,
        'transactionId', v_transaction_id,
        'message', '积分充值成功'
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM,
            'message', '积分充值失败'
        );
END;
$$;

-- 2. 确保get_or_create_user_credit_balance函数存在并返回正确类型
CREATE OR REPLACE FUNCTION get_or_create_user_credit_balance(p_user_id UUID)
RETURNS user_credit_balance
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_balance_record user_credit_balance;
    v_initial_amount INTEGER := 5; -- 新用户初始积分
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
            v_initial_amount,
            v_initial_amount,
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

-- 3. 修复用户积分余额表的RLS策略，添加插入权限
DROP POLICY IF EXISTS "Service role can manage credit balance" ON user_credit_balance;
CREATE POLICY "Service role can manage credit balance" ON user_credit_balance
    FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users can insert own credit balance" ON user_credit_balance;
CREATE POLICY "Users can insert own credit balance" ON user_credit_balance
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 4. 修复积分交易表的RLS策略，添加插入权限
DROP POLICY IF EXISTS "Service role can manage transactions" ON credit_transaction;
CREATE POLICY "Service role can manage transactions" ON credit_transaction
    FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users can insert own transactions" ON credit_transaction;
CREATE POLICY "Users can insert own transactions" ON credit_transaction
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 5. 添加subscription_credits表的RLS策略
DROP POLICY IF EXISTS "Users can view own subscription credits" ON subscription_credits;
CREATE POLICY "Users can view own subscription credits" ON subscription_credits
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage subscription credits" ON subscription_credits;
CREATE POLICY "Service role can manage subscription credits" ON subscription_credits
    FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users can insert own subscription credits" ON subscription_credits;
CREATE POLICY "Users can insert own subscription credits" ON subscription_credits
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 6. 创建添加奖励积分的数据库函数
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
    -- 获取或创建用户积分记录
    SELECT * INTO v_balance_record
    FROM user_credit_balance
    WHERE user_id = p_user_id;

    IF v_balance_record IS NULL THEN
        -- 创建新的积分记录
        INSERT INTO user_credit_balance (
            user_id,
            balance,
            total_recharged,
            total_consumed,
            created_at,
            updated_at
        ) VALUES (
            p_user_id,
            bonus_amount,
            bonus_amount, -- 奖励积分也算作充值
            0,
            NOW(),
            NOW()
        )
        RETURNING * INTO v_balance_record;
        
        v_new_balance := bonus_amount;
    ELSE
        -- 更新现有余额
        v_new_balance := v_balance_record.balance + bonus_amount;
        
        UPDATE user_credit_balance
        SET 
            balance = v_new_balance,
            total_recharged = total_recharged + bonus_amount,
            updated_at = NOW()
        WHERE id = v_balance_record.id;
    END IF;

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
    )
    RETURNING id INTO v_transaction_id;

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
            'error', SQLERRM,
            'message', '奖励积分添加失败'
        );
END;
$$;

-- 7. 创建检查和修复用户积分的函数
CREATE OR REPLACE FUNCTION fix_user_credits_if_needed(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_balance_record user_credit_balance;
    v_created BOOLEAN := FALSE;
BEGIN
    -- 检查用户是否有积分记录
    SELECT * INTO v_balance_record
    FROM user_credit_balance
    WHERE user_id = p_user_id;

    -- 如果没有记录，创建一个
    IF v_balance_record IS NULL THEN
        v_balance_record := get_or_create_user_credit_balance(p_user_id);
        v_created := TRUE;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'created', v_created,
        'balance', v_balance_record.balance,
        'message', CASE WHEN v_created THEN '已创建用户积分记录' ELSE '用户积分记录已存在' END
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

-- 显示函数创建完成信息
DO $$
BEGIN
    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'RLS和函数修复完成！';
    RAISE NOTICE '1. ✅ 已创建 recharge_credits_v2 函数';
    RAISE NOTICE '2. ✅ 已创建 add_bonus_credits_v2 函数';
    RAISE NOTICE '3. ✅ 已修复 RLS 策略，允许正确的插入权限';
    RAISE NOTICE '4. ✅ 已创建修复函数 fix_user_credits_if_needed';
    RAISE NOTICE '5. ✅ 所有函数使用 SECURITY DEFINER 绕过 RLS 限制';
    RAISE NOTICE '=================================================================';
END $$; 