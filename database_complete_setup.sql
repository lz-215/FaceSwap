-- =================================================================
-- Face-Swap 完整数据库初始化脚本
-- =================================================================
-- 用途：从零开始创建完整的 Face-Swap 应用数据库
-- 版本：1.0
-- 更新时间：2025-07-11
-- =================================================================

-- 开始事务
BEGIN;

-- =================================================================
-- 1. 删除现有函数和表（如果存在）- 谨慎使用
-- =================================================================
-- 注意：以下语句将删除所有现有数据和函数！

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

-- 删除现有表
 DROP TABLE IF EXISTS face_swap_histories CASCADE;
 DROP TABLE IF EXISTS webhook_errors CASCADE;
 DROP TABLE IF EXISTS webhook_failures CASCADE;
 DROP TABLE IF EXISTS subscription_status_monitor CASCADE;
 DROP TABLE IF EXISTS subscription_credits CASCADE;
 DROP TABLE IF EXISTS credit_transaction CASCADE;
 DROP TABLE IF EXISTS user_credit_balance CASCADE;
 DROP TABLE IF EXISTS user_profiles CASCADE;

-- =================================================================
-- 2. 创建扩展（如果需要）
-- =================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =================================================================
-- 3. 创建核心数据表
-- =================================================================

-- 3.1 用户扩展信息表
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    display_name TEXT,
    first_name TEXT,
    last_name TEXT,
    avatar_url TEXT,
    customer_id TEXT UNIQUE, -- Stripe 客户ID
    subscription_status TEXT,
    project_id TEXT DEFAULT '0616faceswap',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE user_profiles IS '用户扩展信息表，存储用户的详细信息和 Stripe 客户关联';
COMMENT ON COLUMN user_profiles.customer_id IS 'Stripe 客户ID，用于关联支付系统';
COMMENT ON COLUMN user_profiles.subscription_status IS '订阅状态：active, cancelled, expired, trialing 等';

-- 3.2 用户积分余额表
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

COMMENT ON TABLE user_credit_balance IS '用户积分余额表，记录用户的积分余额和统计信息';
COMMENT ON COLUMN user_credit_balance.balance IS '当前可用积分余额';
COMMENT ON COLUMN user_credit_balance.total_recharged IS '累计充值积分';
COMMENT ON COLUMN user_credit_balance.total_consumed IS '累计消费积分';

-- 3.3 积分交易记录表
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

COMMENT ON TABLE credit_transaction IS '积分交易记录表，记录所有积分变动';
COMMENT ON COLUMN credit_transaction.type IS '交易类型：recharge(充值), consumption(消费), bonus(奖励), subscription(订阅), expiration(过期), refund(退款)';
COMMENT ON COLUMN credit_transaction.amount IS '积分变动数量，正数为增加，负数为减少';
COMMENT ON COLUMN credit_transaction.balance_after IS '交易后的积分余额';
COMMENT ON COLUMN credit_transaction.related_subscription_id IS '相关订阅ID（如果适用）';

-- 3.4 订阅积分表
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

COMMENT ON TABLE subscription_credits IS '订阅积分表，管理订阅产生的积分';
COMMENT ON COLUMN subscription_credits.subscription_id IS 'Stripe 订阅ID';
COMMENT ON COLUMN subscription_credits.credits IS '订阅总积分';
COMMENT ON COLUMN subscription_credits.remaining_credits IS '剩余积分';
COMMENT ON COLUMN subscription_credits.status IS '订阅状态：active(有效), cancelled(已取消), expired(已过期)';

-- 3.5 订阅状态监控表
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

COMMENT ON TABLE subscription_status_monitor IS '订阅状态监控表，提供订阅的完整状态信息';
COMMENT ON COLUMN subscription_status_monitor.stripe_status IS 'Stripe 订阅状态';
COMMENT ON COLUMN subscription_status_monitor.product_id IS 'Stripe 产品ID';
COMMENT ON COLUMN subscription_status_monitor.price_id IS 'Stripe 价格ID';

-- 3.6 人脸交换历史表
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

COMMENT ON TABLE face_swap_histories IS '人脸交换历史记录表';
COMMENT ON COLUMN face_swap_histories.result_image_path IS '结果图片存储路径';
COMMENT ON COLUMN face_swap_histories.origin_image_url IS '原始图片URL';

-- 3.7 错误日志表
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

COMMENT ON TABLE webhook_failures IS 'Webhook 失败记录表';
COMMENT ON TABLE webhook_errors IS 'Webhook 错误日志表';

-- =================================================================
-- 4. 创建索引
-- =================================================================

-- 用户相关索引
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_customer_id ON user_profiles(customer_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_subscription_status ON user_profiles(subscription_status);

-- 积分相关索引
CREATE INDEX IF NOT EXISTS idx_user_credit_balance_user_id ON user_credit_balance(user_id);
CREATE INDEX IF NOT EXISTS idx_user_credit_balance_balance ON user_credit_balance(balance);

CREATE INDEX IF NOT EXISTS idx_credit_transaction_user_id ON credit_transaction(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transaction_created_at ON credit_transaction(created_at);
CREATE INDEX IF NOT EXISTS idx_credit_transaction_type ON credit_transaction(type);
CREATE INDEX IF NOT EXISTS idx_credit_transaction_user_id_created_at ON credit_transaction(user_id, created_at DESC);

-- 订阅相关索引
CREATE INDEX IF NOT EXISTS idx_subscription_credits_user_id ON subscription_credits(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_credits_subscription_id ON subscription_credits(subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscription_credits_status ON subscription_credits(status);
CREATE INDEX IF NOT EXISTS idx_subscription_credits_end_date ON subscription_credits(end_date);
CREATE INDEX IF NOT EXISTS idx_subscription_credits_user_id_status ON subscription_credits(user_id, status);

CREATE INDEX IF NOT EXISTS idx_subscription_status_monitor_user_id ON subscription_status_monitor(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_status_monitor_subscription_id ON subscription_status_monitor(subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscription_status_monitor_status ON subscription_status_monitor(status);
CREATE INDEX IF NOT EXISTS idx_subscription_status_monitor_end_date ON subscription_status_monitor(end_date);
CREATE INDEX IF NOT EXISTS idx_subscription_status_monitor_stripe_customer_id ON subscription_status_monitor(stripe_customer_id);

-- 历史记录索引
CREATE INDEX IF NOT EXISTS idx_face_swap_histories_user_id ON face_swap_histories(user_id);
CREATE INDEX IF NOT EXISTS idx_face_swap_histories_created_at ON face_swap_histories(created_at);
CREATE INDEX IF NOT EXISTS idx_face_swap_histories_user_id_created_at ON face_swap_histories(user_id, created_at DESC);

-- 错误日志索引
CREATE INDEX IF NOT EXISTS idx_webhook_failures_payment_intent_id ON webhook_failures(payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_webhook_failures_created_at ON webhook_failures(created_at);
CREATE INDEX IF NOT EXISTS idx_webhook_errors_event_id ON webhook_errors(event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_errors_created_at ON webhook_errors(created_at);

-- =================================================================
-- 5. 创建触发器函数
-- =================================================================

-- 通用的更新时间戳函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- =================================================================
-- 6. 创建触发器
-- =================================================================

-- 为所有需要的表创建 updated_at 触发器
CREATE OR REPLACE TRIGGER update_user_profiles_updated_at
    BEFORE UPDATE ON user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_user_credit_balance_updated_at
    BEFORE UPDATE ON user_credit_balance
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_subscription_credits_updated_at
    BEFORE UPDATE ON subscription_credits
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_subscription_status_monitor_updated_at
    BEFORE UPDATE ON subscription_status_monitor
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_face_swap_histories_updated_at
    BEFORE UPDATE ON face_swap_histories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =================================================================
-- 7. 创建视图
-- =================================================================

-- 实时有效订阅视图
CREATE OR REPLACE VIEW active_subscriptions_view AS
SELECT 
    user_id,
    subscription_id,
    remaining_credits,
    end_date,
    status
FROM subscription_credits
WHERE status = 'active' AND end_date > NOW();

COMMENT ON VIEW active_subscriptions_view IS '有效订阅视图，显示当前活跃且未过期的订阅';

-- 用户积分汇总视图
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

COMMENT ON VIEW user_credits_summary IS '用户积分汇总视图，显示用户的完整积分状态';

-- =================================================================
-- 8. 启用行级安全 (RLS)
-- =================================================================

-- 为所有用户数据表启用 RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_credit_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transaction ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_status_monitor ENABLE ROW LEVEL SECURITY;
ALTER TABLE face_swap_histories ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_failures ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_errors ENABLE ROW LEVEL SECURITY;

-- =================================================================
-- 9. 创建 RLS 策略
-- =================================================================

-- 9.1 用户配置表策略
CREATE POLICY "Users can view their own profile" ON user_profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON user_profiles
    FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON user_profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Service role can manage user profiles" ON user_profiles
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 9.2 积分余额表策略
CREATE POLICY "Users can view their own credit balance" ON user_credit_balance
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage credit balance" ON user_credit_balance
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 9.3 积分交易记录表策略
CREATE POLICY "Users can view their own transactions" ON credit_transaction
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage transactions" ON credit_transaction
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 9.4 订阅积分表策略
CREATE POLICY "Users can view their own subscription credits" ON subscription_credits
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage subscription credits" ON subscription_credits
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 9.5 订阅状态监控表策略
CREATE POLICY "Users can view their own subscription status" ON subscription_status_monitor
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage subscription monitor" ON subscription_status_monitor
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 9.6 人脸交换历史表策略
CREATE POLICY "Users can view their own face swap history" ON face_swap_histories
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own face swap history" ON face_swap_histories
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can manage face swap histories" ON face_swap_histories
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 9.7 错误日志表策略（仅服务角色可访问）
CREATE POLICY "Only service role can manage webhook failures" ON webhook_failures
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Only service role can manage webhook errors" ON webhook_errors
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =================================================================
-- 10. 创建业务函数
-- =================================================================

-- 10.1 获取或创建用户积分余额
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
    -- 尝试获取现有记录
    RETURN QUERY
    SELECT 
        ucb.user_id,
        ucb.balance,
        ucb.total_recharged,
        ucb.total_consumed
    FROM user_credit_balance ucb
    WHERE ucb.user_id = p_user_id;
    
    -- 如果没有记录，创建一个新的
    IF NOT FOUND THEN
        INSERT INTO user_credit_balance (user_id, balance, total_recharged, total_consumed)
        VALUES (p_user_id, 5, 0, 0) -- 新用户赠送5积分
        RETURNING 
            user_credit_balance.user_id,
            user_credit_balance.balance,
            user_credit_balance.total_recharged,
            user_credit_balance.total_consumed;
    END IF;
END;
$$;

-- 10.2 实时计算用户积分余额
CREATE OR REPLACE FUNCTION get_user_balance_realtime(p_user_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(SUM(remaining_credits), 0)::INTEGER
    FROM active_subscriptions_view
    WHERE user_id = p_user_id;
$$;

-- 10.3 原子化积分消费
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
    -- 参数验证
    IF p_credits_to_consume <= 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'invalid_amount',
            'message', '消费积分必须大于0'
        );
    END IF;
    
    -- 获取当前余额
    SELECT balance INTO v_current_balance
    FROM user_credit_balance
    WHERE user_id = p_user_id
    FOR UPDATE;
    
    -- 如果没有余额记录，创建一个
    IF v_current_balance IS NULL THEN
        INSERT INTO user_credit_balance (user_id, balance, total_recharged, total_consumed)
        VALUES (p_user_id, 5, 0, 0);
        v_current_balance := 5;
    END IF;
    
    -- 计算实时总余额（包括订阅积分）
    v_current_balance := v_current_balance + get_user_balance_realtime(p_user_id);
    
    -- 检查余额是否足够
    IF v_current_balance < p_credits_to_consume THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'insufficient_credits',
            'message', '积分余额不足',
            'current_balance', v_current_balance,
            'required', p_credits_to_consume
        );
    END IF;
    
    -- 先从订阅积分中消费
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
            -- 更新订阅积分
            UPDATE subscription_credits 
            SET remaining_credits = remaining_credits - v_to_consume
            WHERE id = rec.id;
            
            v_consumed_from_subscription := v_consumed_from_subscription + v_to_consume;
            
            -- 如果已经消费够了，退出循环
            IF v_consumed_from_subscription >= p_credits_to_consume THEN
                EXIT;
            END IF;
        END;
    END LOOP;
    
    -- 如果还需要消费，从余额中消费
    IF v_consumed_from_subscription < p_credits_to_consume THEN
        v_consumed_from_balance := p_credits_to_consume - v_consumed_from_subscription;
        
        -- 更新用户余额
        UPDATE user_credit_balance 
        SET 
            balance = balance - v_consumed_from_balance,
            total_consumed = total_consumed + p_credits_to_consume
        WHERE user_id = p_user_id;
    ELSE
        -- 只更新总消费
        UPDATE user_credit_balance 
        SET total_consumed = total_consumed + p_credits_to_consume
        WHERE user_id = p_user_id;
    END IF;
    
    -- 计算新余额
    v_new_balance := v_current_balance - p_credits_to_consume;
    
    -- 记录交易
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
    
    -- 返回结果
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
        -- 记录错误
        RAISE WARNING 'Error in consume_credits_atomic for user %: %', p_user_id, SQLERRM;
        RETURN jsonb_build_object(
            'success', false,
            'error', 'system_error',
            'message', SQLERRM
        );
END;
$$;

-- 10.4 添加积分和记录交易
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
    -- 参数验证
    IF p_credits_to_add <= 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'invalid_amount',
            'message', '添加积分必须大于0'
        );
    END IF;
    
    -- 更新用户积分余额
    INSERT INTO user_credit_balance (user_id, balance, total_recharged, total_consumed)
    VALUES (p_user_id, p_credits_to_add, p_credits_to_add, 0)
    ON CONFLICT (user_id)
    DO UPDATE SET
        balance = user_credit_balance.balance + p_credits_to_add,
        total_recharged = user_credit_balance.total_recharged + p_credits_to_add,
        updated_at = NOW()
    RETURNING balance INTO v_new_balance;
    
    -- 记录交易
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
    
    -- 返回结果
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

-- 10.5 处理过期的订阅积分
CREATE OR REPLACE FUNCTION expire_credits()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    expired_record RECORD;
    v_transaction_id UUID;
BEGIN
    -- 查找并处理过期的订阅积分
    FOR expired_record IN 
        SELECT id, user_id, subscription_id, remaining_credits
        FROM subscription_credits
        WHERE status = 'active' 
        AND end_date <= NOW()
        AND remaining_credits > 0
        FOR UPDATE
    LOOP
        -- 更新订阅状态为过期
        UPDATE subscription_credits 
        SET status = 'expired'
        WHERE id = expired_record.id;
        
        -- 记录积分过期交易
        INSERT INTO credit_transaction (
            user_id,
            type,
            amount,
            balance_after,
            description,
            related_subscription_id,
            metadata
        ) VALUES (
            expired_record.user_id,
            'expiration',
            -expired_record.remaining_credits,
            (SELECT COALESCE(balance, 0) FROM user_credit_balance WHERE user_id = expired_record.user_id),
            '订阅积分过期',
            expired_record.subscription_id,
            jsonb_build_object(
                'expired_credits', expired_record.remaining_credits,
                'subscription_id', expired_record.subscription_id
            )
        );
        
        RAISE LOG 'Expired % credits for user % from subscription %', 
            expired_record.remaining_credits, expired_record.user_id, expired_record.subscription_id;
    END LOOP;
END;
$$;

-- 10.6 创建用户配置（包含邮箱）
CREATE OR REPLACE FUNCTION upsert_user_profile_with_email(
    p_user_id UUID,
    p_email TEXT,
    p_display_name TEXT DEFAULT NULL,
    p_first_name TEXT DEFAULT NULL,
    p_last_name TEXT DEFAULT NULL,
    p_avatar_url TEXT DEFAULT NULL,
    p_customer_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- 创建或更新用户配置
    INSERT INTO user_profiles (
        id, email, display_name, first_name, last_name, avatar_url, customer_id
    ) VALUES (
        p_user_id, p_email, p_display_name, p_first_name, p_last_name, p_avatar_url, p_customer_id
    )
    ON CONFLICT (id)
    DO UPDATE SET
        email = COALESCE(p_email, user_profiles.email),
        display_name = COALESCE(p_display_name, user_profiles.display_name),
        first_name = COALESCE(p_first_name, user_profiles.first_name),
        last_name = COALESCE(p_last_name, user_profiles.last_name),
        avatar_url = COALESCE(p_avatar_url, user_profiles.avatar_url),
        customer_id = COALESCE(p_customer_id, user_profiles.customer_id),
        updated_at = NOW();
    
    -- 确保用户有积分余额记录
    PERFORM get_or_create_user_credit_balance(p_user_id);
    
    RETURN jsonb_build_object(
        'success', true,
        'user_id', p_user_id,
        'message', '用户配置已更新'
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'system_error',
            'message', SQLERRM
        );
END;
$$;

-- =================================================================
-- 11. 创建定时任务函数（可选）
-- =================================================================

-- 清理过期的错误日志
CREATE OR REPLACE FUNCTION cleanup_old_logs()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- 删除30天前的 webhook 错误日志
    DELETE FROM webhook_errors 
    WHERE created_at < NOW() - INTERVAL '30 days';
    
    -- 删除30天前的 webhook 失败日志
    DELETE FROM webhook_failures 
    WHERE created_at < NOW() - INTERVAL '30 days';
    
    RAISE LOG 'Cleaned up old webhook logs';
END;
$$;

-- =================================================================
-- 12. 权限设置
-- =================================================================

-- 为认证用户授权访问视图
GRANT SELECT ON active_subscriptions_view TO authenticated;
GRANT SELECT ON user_credits_summary TO authenticated;

-- 为服务角色授权访问所有函数
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- 为认证用户授权访问特定函数
GRANT EXECUTE ON FUNCTION get_or_create_user_credit_balance(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_balance_realtime(UUID) TO authenticated;

-- =================================================================
-- 13. 初始化数据（可选）
-- =================================================================

-- 可以在这里添加一些初始化数据，如：
-- INSERT INTO user_profiles (id, email, display_name) VALUES (...);

-- =================================================================
-- 提交事务
-- =================================================================

COMMIT;

-- =================================================================
-- 脚本执行完成
-- =================================================================

-- 输出完成信息
DO $$
BEGIN
    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'Face-Swap 数据库初始化完成！';
    RAISE NOTICE '=================================================================';
    RAISE NOTICE '已创建的表：';
    RAISE NOTICE '  - user_profiles (用户配置)';
    RAISE NOTICE '  - user_credit_balance (用户积分余额)';
    RAISE NOTICE '  - credit_transaction (积分交易记录)';
    RAISE NOTICE '  - subscription_credits (订阅积分)';
    RAISE NOTICE '  - subscription_status_monitor (订阅状态监控)';
    RAISE NOTICE '  - face_swap_histories (人脸交换历史)';
    RAISE NOTICE '  - webhook_failures (Webhook失败记录)';
    RAISE NOTICE '  - webhook_errors (Webhook错误日志)';
    RAISE NOTICE '';
    RAISE NOTICE '已创建的视图：';
    RAISE NOTICE '  - active_subscriptions_view (有效订阅视图)';
    RAISE NOTICE '  - user_credits_summary (用户积分汇总视图)';
    RAISE NOTICE '';
    RAISE NOTICE '已创建的函数：';
    RAISE NOTICE '  - get_or_create_user_credit_balance() (获取或创建用户积分余额)';
    RAISE NOTICE '  - get_user_balance_realtime() (实时获取用户余额)';
    RAISE NOTICE '  - consume_credits_atomic() (原子化积分消费)';
    RAISE NOTICE '  - add_credits_and_log_transaction() (添加积分和记录交易)';
    RAISE NOTICE '  - expire_credits() (处理过期积分)';
    RAISE NOTICE '  - upsert_user_profile_with_email() (创建或更新用户配置)';
    RAISE NOTICE '  - cleanup_old_logs() (清理旧日志)';
    RAISE NOTICE '';
    RAISE NOTICE '已配置 RLS 策略，保护用户数据安全';
    RAISE NOTICE '已创建必要的索引，优化查询性能';
    RAISE NOTICE '已配置触发器，自动更新时间戳';
    RAISE NOTICE '=================================================================';
END $$;