-- =================================================================
-- Face-Swap 数据库安全更新脚本
-- =================================================================
-- 用途：在不删除现有数据的情况下更新函数和结构
-- 版本：1.0
-- 更新时间：2025-07-11
-- =================================================================

BEGIN;

-- =================================================================
-- 1. 安全删除和重建函数（保留数据）
-- =================================================================

-- 删除可能存在的函数（避免参数冲突）
DROP FUNCTION IF EXISTS consume_credits_atomic(uuid,integer,text) CASCADE;
DROP FUNCTION IF EXISTS add_credits_and_log_transaction(uuid,integer,text,jsonb) CASCADE;
DROP FUNCTION IF EXISTS get_user_balance_realtime(uuid) CASCADE;
DROP FUNCTION IF EXISTS get_or_create_user_credit_balance(uuid) CASCADE;
DROP FUNCTION IF EXISTS expire_credits() CASCADE;
DROP FUNCTION IF EXISTS upsert_user_profile_with_email(uuid,text,text,text,text,text,text) CASCADE;
DROP FUNCTION IF EXISTS cleanup_old_logs() CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- 删除可能存在的视图
DROP VIEW IF EXISTS user_credits_summary CASCADE;
DROP VIEW IF EXISTS active_subscriptions_view CASCADE;

-- =================================================================
-- 2. 确保所有表都存在（不删除现有数据）
-- =================================================================

-- 2.1 用户扩展信息表
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    display_name TEXT,
    first_name TEXT,
    last_name TEXT,
    avatar_url TEXT,
    customer_id TEXT UNIQUE,
    subscription_status TEXT,
    project_id TEXT DEFAULT '0616faceswap',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2.2 用户积分余额表
CREATE TABLE IF NOT EXISTS user_credit_balance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    balance INTEGER NOT NULL DEFAULT 0,
    total_recharged INTEGER NOT NULL DEFAULT 0,
    total_consumed INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT positive_balance CHECK (balance >= 0),
    CONSTRAINT positive_recharged CHECK (total_recharged >= 0),
    CONSTRAINT positive_consumed CHECK (total_consumed >= 0)
);

-- 2.3 积分交易记录表
CREATE TABLE IF NOT EXISTS credit_transaction (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('recharge', 'consumption', 'bonus', 'subscription', 'expiration', 'refund')),
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    description TEXT,
    related_subscription_id TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT valid_balance_after CHECK (balance_after >= 0)
);

-- 2.4 订阅积分表
CREATE TABLE IF NOT EXISTS subscription_credits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    subscription_id TEXT NOT NULL UNIQUE,
    credits INTEGER NOT NULL,
    remaining_credits INTEGER NOT NULL,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT positive_credits CHECK (credits > 0),
    CONSTRAINT positive_remaining_credits CHECK (remaining_credits >= 0),
    CONSTRAINT remaining_not_exceed_total CHECK (remaining_credits <= credits),
    CONSTRAINT valid_date_range CHECK (end_date > start_date)
);

-- 2.5 订阅状态监控表
CREATE TABLE IF NOT EXISTS subscription_status_monitor (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    subscription_id TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL,
    total_credits INTEGER NOT NULL,
    remaining_credits INTEGER NOT NULL,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    current_period_start TIMESTAMP WITH TIME ZONE,
    current_period_end TIMESTAMP WITH TIME ZONE,
    product_id TEXT,
    price_id TEXT,
    stripe_customer_id TEXT,
    stripe_status TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT positive_total_credits CHECK (total_credits > 0),
    CONSTRAINT positive_remaining_credits CHECK (remaining_credits >= 0),
    CONSTRAINT remaining_not_exceed_total CHECK (remaining_credits <= total_credits),
    CONSTRAINT valid_date_range CHECK (end_date > start_date)
);

-- 2.6 人脸交换历史表
CREATE TABLE IF NOT EXISTS face_swap_histories (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    result_image_path TEXT NOT NULL,
    origin_image_url TEXT,
    description TEXT,
    project_id TEXT DEFAULT '0616faceswap',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2.7 错误日志表
CREATE TABLE IF NOT EXISTS webhook_failures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_intent_id TEXT,
    recharge_id TEXT,
    error_message TEXT,
    error_details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS webhook_errors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id TEXT,
    event_type TEXT,
    error_message TEXT,
    error_stack TEXT,
    error_details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =================================================================
-- 3. 创建索引（如果不存在）
-- =================================================================

CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_customer_id ON user_profiles(customer_id);
CREATE INDEX IF NOT EXISTS idx_user_credit_balance_user_id ON user_credit_balance(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transaction_user_id ON credit_transaction(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transaction_created_at ON credit_transaction(created_at);
CREATE INDEX IF NOT EXISTS idx_subscription_credits_user_id ON subscription_credits(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_credits_subscription_id ON subscription_credits(subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscription_credits_status ON subscription_credits(status);
CREATE INDEX IF NOT EXISTS idx_subscription_credits_end_date ON subscription_credits(end_date);

-- =================================================================
-- 4. 重新创建触发器函数
-- =================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- =================================================================
-- 5. 重新创建触发器
-- =================================================================

DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER update_user_profiles_updated_at
    BEFORE UPDATE ON user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_credit_balance_updated_at ON user_credit_balance;
CREATE TRIGGER update_user_credit_balance_updated_at
    BEFORE UPDATE ON user_credit_balance
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_subscription_credits_updated_at ON subscription_credits;
CREATE TRIGGER update_subscription_credits_updated_at
    BEFORE UPDATE ON subscription_credits
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =================================================================
-- 6. 重新创建视图
-- =================================================================

CREATE OR REPLACE VIEW active_subscriptions_view AS
SELECT 
    user_id,
    subscription_id,
    remaining_credits,
    end_date,
    status
FROM subscription_credits
WHERE status = 'active' AND end_date > NOW();

CREATE OR REPLACE VIEW user_credits_summary AS
SELECT 
    u.id as user_id,
    u.email,
    COALESCE(ucb.balance, 0) as current_balance,
    COALESCE(ucb.total_recharged, 0) as total_recharged,
    COALESCE(ucb.total_consumed, 0) as total_consumed,
    COALESCE(active_sub.total_subscription_credits, 0) as active_subscription_credits,
    COALESCE(active_sub.subscription_count, 0) as active_subscription_count
FROM auth.users u
LEFT JOIN user_credit_balance ucb ON u.id = ucb.user_id
LEFT JOIN (
    SELECT 
        user_id,
        SUM(remaining_credits) as total_subscription_credits,
        COUNT(*) as subscription_count
    FROM active_subscriptions_view
    GROUP BY user_id
) active_sub ON u.id = active_sub.user_id;

-- =================================================================
-- 7. 重新创建核心业务函数
-- =================================================================

-- 7.1 获取或创建用户积分余额
CREATE OR REPLACE FUNCTION get_or_create_user_credit_balance(p_user_id UUID)
RETURNS TABLE(
    user_id UUID,
    balance INTEGER,
    total_recharged INTEGER,
    total_consumed INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ucb.user_id,
        ucb.balance,
        ucb.total_recharged,
        ucb.total_consumed
    FROM user_credit_balance ucb
    WHERE ucb.user_id = p_user_id;
    
    IF NOT FOUND THEN
        INSERT INTO user_credit_balance (user_id, balance, total_recharged, total_consumed)
        VALUES (p_user_id, 5, 0, 0)
        RETURNING 
            user_credit_balance.user_id,
            user_credit_balance.balance,
            user_credit_balance.total_recharged,
            user_credit_balance.total_consumed;
    END IF;
END;
$$;

-- 7.2 实时计算用户积分余额
CREATE OR REPLACE FUNCTION get_user_balance_realtime(p_user_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(SUM(remaining_credits), 0)::INTEGER
    FROM active_subscriptions_view
    WHERE user_id = p_user_id;
$$;

-- 7.3 添加积分和记录交易
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
    IF p_credits_to_add <= 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'invalid_amount',
            'message', '添加积分必须大于0'
        );
    END IF;
    
    INSERT INTO user_credit_balance (user_id, balance, total_recharged, total_consumed)
    VALUES (p_user_id, p_credits_to_add, p_credits_to_add, 0)
    ON CONFLICT (user_id)
    DO UPDATE SET
        balance = user_credit_balance.balance + p_credits_to_add,
        total_recharged = user_credit_balance.total_recharged + p_credits_to_add,
        updated_at = NOW()
    RETURNING balance INTO v_new_balance;
    
    INSERT INTO credit_transaction (
        user_id,
        type,
        amount,
        balance_after,
        description,
        metadata
    ) VALUES (
        p_user_id,
        'recharge',
        p_credits_to_add,
        v_new_balance,
        p_description,
        p_metadata
    ) RETURNING id INTO v_transaction_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'credits_added', p_credits_to_add,
        'balance_after', v_new_balance,
        'transaction_id', v_transaction_id
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Error in add_credits_and_log_transaction for user %: %', p_user_id, SQLERRM;
        RETURN jsonb_build_object(
            'success', false,
            'error', 'system_error',
            'message', SQLERRM
        );
END;
$$;

-- 7.4 原子化积分消费
CREATE OR REPLACE FUNCTION consume_credits_atomic(
    p_user_id UUID,
    p_credits_to_consume INTEGER,
    p_description TEXT DEFAULT '积分消费'
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
    v_consumed_from_subscription INTEGER := 0;
    v_consumed_from_balance INTEGER := 0;
    rec RECORD;
BEGIN
    IF p_credits_to_consume <= 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'invalid_amount',
            'message', '消费积分必须大于0'
        );
    END IF;
    
    SELECT balance INTO v_current_balance
    FROM user_credit_balance
    WHERE user_id = p_user_id
    FOR UPDATE;
    
    IF v_current_balance IS NULL THEN
        INSERT INTO user_credit_balance (user_id, balance, total_recharged, total_consumed)
        VALUES (p_user_id, 5, 0, 0);
        v_current_balance := 5;
    END IF;
    
    v_current_balance := v_current_balance + get_user_balance_realtime(p_user_id);
    
    IF v_current_balance < p_credits_to_consume THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'insufficient_credits',
            'message', '积分余额不足',
            'current_balance', v_current_balance,
            'required', p_credits_to_consume
        );
    END IF;
    
    FOR rec IN 
        SELECT id, remaining_credits
        FROM subscription_credits
        WHERE user_id = p_user_id 
        AND status = 'active' 
        AND end_date > NOW()
        AND remaining_credits > 0
        ORDER BY end_date ASC
        FOR UPDATE
    LOOP
        DECLARE
            v_to_consume INTEGER := LEAST(rec.remaining_credits, p_credits_to_consume - v_consumed_from_subscription);
        BEGIN
            UPDATE subscription_credits 
            SET remaining_credits = remaining_credits - v_to_consume
            WHERE id = rec.id;
            
            v_consumed_from_subscription := v_consumed_from_subscription + v_to_consume;
            
            IF v_consumed_from_subscription >= p_credits_to_consume THEN
                EXIT;
            END IF;
        END;
    END LOOP;
    
    IF v_consumed_from_subscription < p_credits_to_consume THEN
        v_consumed_from_balance := p_credits_to_consume - v_consumed_from_subscription;
        
        UPDATE user_credit_balance 
        SET 
            balance = balance - v_consumed_from_balance,
            total_consumed = total_consumed + p_credits_to_consume
        WHERE user_id = p_user_id;
    ELSE
        UPDATE user_credit_balance 
        SET total_consumed = total_consumed + p_credits_to_consume
        WHERE user_id = p_user_id;
    END IF;
    
    v_new_balance := v_current_balance - p_credits_to_consume;
    
    INSERT INTO credit_transaction (
        user_id,
        type,
        amount,
        balance_after,
        description,
        metadata
    ) VALUES (
        p_user_id,
        'consumption',
        -p_credits_to_consume,
        v_new_balance,
        p_description,
        jsonb_build_object(
            'consumed_from_subscription', v_consumed_from_subscription,
            'consumed_from_balance', v_consumed_from_balance
        )
    ) RETURNING id INTO v_transaction_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'credits_consumed', p_credits_to_consume,
        'balance_after', v_new_balance,
        'transaction_id', v_transaction_id,
        'consumed_from_subscription', v_consumed_from_subscription,
        'consumed_from_balance', v_consumed_from_balance
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Error in consume_credits_atomic for user %: %', p_user_id, SQLERRM;
        RETURN jsonb_build_object(
            'success', false,
            'error', 'system_error',
            'message', SQLERRM
        );
END;
$$;

-- =================================================================
-- 8. 启用RLS和创建策略
-- =================================================================

-- 启用RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_credit_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transaction ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_status_monitor ENABLE ROW LEVEL SECURITY;
ALTER TABLE face_swap_histories ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_failures ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_errors ENABLE ROW LEVEL SECURITY;

-- 删除现有策略
DROP POLICY IF EXISTS "Users can view their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Service role can manage user profiles" ON user_profiles;

-- 重新创建策略
CREATE POLICY "Users can view their own profile" ON user_profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON user_profiles
    FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON user_profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Service role can manage user profiles" ON user_profiles
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 积分余额表策略
DROP POLICY IF EXISTS "Users can view their own credit balance" ON user_credit_balance;
DROP POLICY IF EXISTS "Service role can manage credit balance" ON user_credit_balance;

CREATE POLICY "Users can view their own credit balance" ON user_credit_balance
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage credit balance" ON user_credit_balance
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =================================================================
-- 9. 权限设置
-- =================================================================

GRANT SELECT ON active_subscriptions_view TO authenticated;
GRANT SELECT ON user_credits_summary TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
GRANT EXECUTE ON FUNCTION get_or_create_user_credit_balance(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_balance_realtime(UUID) TO authenticated;

COMMIT;

-- 输出完成信息
DO $$
BEGIN
    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'Face-Swap 数据库安全更新完成！';
    RAISE NOTICE '=================================================================';
    RAISE NOTICE '已安全更新所有函数和结构，保留现有数据';
    RAISE NOTICE '现在可以执行 database_missing_functions.sql 补充函数';
    RAISE NOTICE '=================================================================';
END $$;