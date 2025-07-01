-- AIFaceSwap 数据库表结构
-- 创建用户积分余额表
CREATE TABLE IF NOT EXISTS user_credit_balance (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    "userId" TEXT NOT NULL UNIQUE,
    balance INTEGER NOT NULL DEFAULT 0,
    "totalRecharged" INTEGER NOT NULL DEFAULT 0,
    "totalConsumed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- 约束
    CONSTRAINT positive_balance CHECK (balance >= 0),
    CONSTRAINT positive_recharged CHECK ("totalRecharged" >= 0),
    CONSTRAINT positive_consumed CHECK ("totalConsumed" >= 0)
);

-- 创建积分交易记录表
CREATE TABLE IF NOT EXISTS credit_transaction (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    "userId" TEXT NOT NULL,
    amount INTEGER NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    "balanceAfter" INTEGER NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB,
    
    -- 约束
    CONSTRAINT valid_transaction_type CHECK (
        type IN ('recharge', 'consumption', 'refund', 'bonus', 'subscription', 'expiration')
    ),
    CONSTRAINT valid_balance_after CHECK ("balanceAfter" >= 0)
);

-- 创建用户配置表 (可选)
CREATE TABLE IF NOT EXISTS user_settings (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    "userId" TEXT NOT NULL UNIQUE,
    language TEXT DEFAULT 'en',
    theme TEXT DEFAULT 'system',
    "emailNotifications" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- 约束
    CONSTRAINT valid_language CHECK (language IN ('en', 'zh')),
    CONSTRAINT valid_theme CHECK (theme IN ('light', 'dark', 'system'))
);

-- 创建人脸交换记录表 (可选，用于历史记录)
CREATE TABLE IF NOT EXISTS face_swap_history (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    "userId" TEXT NOT NULL,
    "originalImage" TEXT,
    "faceImage" TEXT,
    "resultImage" TEXT,
    status TEXT NOT NULL DEFAULT 'processing',
    "errorMessage" TEXT,
    "processingTime" INTEGER, -- 处理时间(毫秒)
    "creditsUsed" INTEGER DEFAULT 1,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- 约束
    CONSTRAINT valid_status CHECK (
        status IN ('processing', 'completed', 'failed', 'cancelled')
    ),
    CONSTRAINT positive_credits CHECK ("creditsUsed" >= 0)
);

-- 创建支付记录表 (可选)
CREATE TABLE IF NOT EXISTS payment_records (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    "userId" TEXT NOT NULL,
    "stripePaymentIntentId" TEXT UNIQUE,
    amount INTEGER NOT NULL, -- 金额(分)
    currency TEXT DEFAULT 'usd',
    "creditsAwarded" INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "completedAt" TIMESTAMP WITH TIME ZONE,
    metadata JSONB,
    
    -- 约束
    CONSTRAINT positive_amount CHECK (amount > 0),
    CONSTRAINT positive_credits_awarded CHECK ("creditsAwarded" > 0),
    CONSTRAINT valid_payment_status CHECK (
        status IN ('pending', 'completed', 'failed', 'cancelled', 'refunded')
    )
);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_user_credit_balance_userId ON user_credit_balance("userId");
CREATE INDEX IF NOT EXISTS idx_credit_transaction_userId ON credit_transaction("userId");
CREATE INDEX IF NOT EXISTS idx_credit_transaction_createdAt ON credit_transaction("createdAt");
CREATE INDEX IF NOT EXISTS idx_face_swap_history_userId ON face_swap_history("userId");
CREATE INDEX IF NOT EXISTS idx_face_swap_history_createdAt ON face_swap_history("createdAt");
CREATE INDEX IF NOT EXISTS idx_payment_records_userId ON payment_records("userId");
CREATE INDEX IF NOT EXISTS idx_payment_records_stripePaymentIntentId ON payment_records("stripePaymentIntentId");

-- 创建更新时间触发器函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为需要的表添加更新时间触发器
CREATE TRIGGER update_user_credit_balance_updated_at
    BEFORE UPDATE ON user_credit_balance
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_settings_updated_at
    BEFORE UPDATE ON user_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 启用行级安全策略 (RLS)
ALTER TABLE user_credit_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transaction ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE face_swap_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_records ENABLE ROW LEVEL SECURITY;

-- 创建 RLS 策略 (用户只能访问自己的数据)
-- 用户积分余额策略
CREATE POLICY "Users can view own credit balance" ON user_credit_balance
    FOR SELECT USING (auth.uid()::TEXT = "userId");

CREATE POLICY "Users can update own credit balance" ON user_credit_balance
    FOR UPDATE USING (auth.uid()::TEXT = "userId");

CREATE POLICY "Users can insert own credit balance" ON user_credit_balance
    FOR INSERT WITH CHECK (auth.uid()::TEXT = "userId");

-- 积分交易记录策略
CREATE POLICY "Users can view own credit transactions" ON credit_transaction
    FOR SELECT USING (auth.uid()::TEXT = "userId");

CREATE POLICY "Service can insert credit transactions" ON credit_transaction
    FOR INSERT WITH CHECK (true); -- 服务端可以插入

-- 用户设置策略
CREATE POLICY "Users can manage own settings" ON user_settings
    FOR ALL USING (auth.uid()::TEXT = "userId");

-- 人脸交换历史策略
CREATE POLICY "Users can view own face swap history" ON face_swap_history
    FOR SELECT USING (auth.uid()::TEXT = "userId");

CREATE POLICY "Service can manage face swap history" ON face_swap_history
    FOR ALL WITH CHECK (true); -- 服务端可以管理

-- 支付记录策略
CREATE POLICY "Users can view own payment records" ON payment_records
    FOR SELECT USING (auth.uid()::TEXT = "userId");

CREATE POLICY "Service can manage payment records" ON payment_records
    FOR ALL WITH CHECK (true); -- 服务端可以管理 