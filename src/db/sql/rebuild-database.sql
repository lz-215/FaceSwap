-- =================================================================
-- AIFaceSwap 数据库重建脚本 - 仅保留核心积分表
-- =================================================================

BEGIN;

-- 删除现有表
DROP TABLE IF EXISTS credit_transaction CASCADE;
DROP TABLE IF EXISTS subscription_credits CASCADE;
DROP TABLE IF EXISTS user_credit_balance CASCADE;
DROP TABLE IF EXISTS "user" CASCADE;

-- 创建用户表
CREATE TABLE IF NOT EXISTS "user" (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    image TEXT,
    email_verified BOOLEAN DEFAULT false,
    first_name TEXT,
    last_name TEXT,
    customer_id TEXT UNIQUE,
    subscription_status TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 用户积分余额表
CREATE TABLE user_credit_balance (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    user_id TEXT NOT NULL UNIQUE REFERENCES "user"(id) ON DELETE CASCADE,
    balance INTEGER NOT NULL DEFAULT 0,
    total_recharged INTEGER NOT NULL DEFAULT 0,
    total_consumed INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT positive_balance CHECK (balance >= 0),
    CONSTRAINT positive_recharged CHECK (total_recharged >= 0),
    CONSTRAINT positive_consumed CHECK (total_consumed >= 0)
);

-- 订阅积分表
CREATE TABLE subscription_credits (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    subscription_id TEXT NOT NULL,
    credits INTEGER NOT NULL,
    remaining_credits INTEGER NOT NULL,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT positive_credits CHECK (credits > 0),
    CONSTRAINT positive_remaining_credits CHECK (remaining_credits >= 0),
    CONSTRAINT remaining_not_exceed_total CHECK (remaining_credits <= credits),
    CONSTRAINT valid_date_range CHECK (end_date > start_date),
    CONSTRAINT valid_subscription_status CHECK (
        status IN ('active', 'expired', 'cancelled')
    )
);

-- 积分交易记录表
CREATE TABLE credit_transaction (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    balance_after INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB,
    related_subscription_id TEXT,
    CONSTRAINT valid_balance_after CHECK (balance_after >= 0)
);

-- 索引
CREATE INDEX idx_user_email ON "user"(email);
CREATE INDEX idx_user_credit_balance_user_id ON user_credit_balance(user_id);
CREATE INDEX idx_subscription_credits_user_id ON subscription_credits(user_id);
CREATE INDEX idx_subscription_credits_subscription_id ON subscription_credits(subscription_id);
CREATE INDEX idx_subscription_credits_status ON subscription_credits(status);
CREATE INDEX idx_subscription_credits_end_date ON subscription_credits(end_date);
CREATE INDEX idx_credit_transaction_user_id ON credit_transaction(user_id);
CREATE INDEX idx_credit_transaction_created_at ON credit_transaction(created_at);
CREATE INDEX idx_credit_transaction_type ON credit_transaction(type);

-- 更新时间触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_user_updated_at
    BEFORE UPDATE ON "user"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_credit_balance_updated_at
    BEFORE UPDATE ON user_credit_balance
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscription_credits_updated_at
    BEFORE UPDATE ON subscription_credits
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMIT;