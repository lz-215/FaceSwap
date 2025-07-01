-- AIFaceSwap 简化版数据库表结构
-- 只包含核心功能所需的表

-- 1. 用户积分表 (核心表)
CREATE TABLE IF NOT EXISTS user_credits (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    balance INTEGER NOT NULL DEFAULT 5, -- 新用户默认5个积分
    total_used INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. 积分交易记录表 (记录所有积分变动)
CREATE TABLE IF NOT EXISTS credit_transactions (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    amount INTEGER NOT NULL, -- 正数为充值，负数为消费
    type VARCHAR(20) NOT NULL, -- 'recharge', 'consume', 'bonus'
    description TEXT,
    balance_after INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 3. 人脸交换日志表 (可选，记录使用历史)
CREATE TABLE IF NOT EXISTS face_swap_logs (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'completed', -- 'completed', 'failed'
    error_message TEXT,
    credits_used INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 创建基本索引
CREATE INDEX IF NOT EXISTS idx_user_credits_user_id ON user_credits(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_face_swap_logs_user_id ON face_swap_logs(user_id);

-- 启用基本的行级安全 (RLS)
ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE face_swap_logs ENABLE ROW LEVEL SECURITY;

-- 简单的RLS策略：用户只能访问自己的数据
CREATE POLICY "user_credits_policy" ON user_credits
    FOR ALL USING (auth.uid()::TEXT = user_id);

CREATE POLICY "credit_transactions_policy" ON credit_transactions
    FOR ALL USING (auth.uid()::TEXT = user_id);

CREATE POLICY "face_swap_logs_policy" ON face_swap_logs
    FOR ALL USING (auth.uid()::TEXT = user_id); 