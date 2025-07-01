-- Face Swap 功能数据库设置
-- 创建必要的表和函数

-- 1. 创建简化的用户积分表
CREATE TABLE IF NOT EXISTS user_credits (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    balance INTEGER NOT NULL DEFAULT 5,
    total_used INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 创建积分交易记录表
CREATE TABLE IF NOT EXISTS credit_transactions (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    amount INTEGER NOT NULL, -- 正数表示充值，负数表示消费
    type TEXT NOT NULL CHECK (type IN ('consume', 'recharge', 'bonus')),
    description TEXT,
    balance_after INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. 创建人脸交换日志表
CREATE TABLE IF NOT EXISTS face_swap_logs (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed',
    error_message TEXT,
    credits_used INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. 创建索引
CREATE INDEX IF NOT EXISTS idx_user_credits_user_id ON user_credits(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_face_swap_logs_user_id ON face_swap_logs(user_id);

-- 5. 创建获取积分函数
CREATE OR REPLACE FUNCTION get_credits(user_id TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    user_balance INTEGER;
BEGIN
    SELECT balance INTO user_balance
    FROM user_credits
    WHERE user_credits.user_id = get_credits.user_id;
    
    -- 如果用户不存在，创建新用户并返回默认积分
    IF user_balance IS NULL THEN
        INSERT INTO user_credits (user_id, balance, total_used)
        VALUES (get_credits.user_id, 5, 0);
        RETURN 5;
    END IF;
    
    RETURN user_balance;
END;
$$;

-- 6. 创建消费积分函数
CREATE OR REPLACE FUNCTION use_credits(
    user_id TEXT,
    amount INTEGER DEFAULT 1
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
    current_balance INTEGER;
BEGIN
    -- 获取当前余额
    SELECT balance INTO current_balance
    FROM user_credits
    WHERE user_credits.user_id = use_credits.user_id;
    
    -- 如果用户不存在，创建新用户
    IF current_balance IS NULL THEN
        INSERT INTO user_credits (user_id, balance, total_used)
        VALUES (use_credits.user_id, 5, 0);
        current_balance := 5;
    END IF;
    
    -- 检查余额是否足够
    IF current_balance < amount THEN
        RETURN FALSE; -- 余额不足
    END IF;
    
    -- 扣除积分
    UPDATE user_credits 
    SET 
        balance = balance - amount,
        total_used = total_used + amount,
        updated_at = NOW()
    WHERE user_credits.user_id = use_credits.user_id;
    
    -- 记录交易
    INSERT INTO credit_transactions (user_id, amount, type, description, balance_after)
    VALUES (
        use_credits.user_id, 
        -amount, 
        'consume', 
        'Face swap operation',
        current_balance - amount
    );
    
    RETURN TRUE; -- 成功
END;
$$;

-- 7. 创建充值积分函数
CREATE OR REPLACE FUNCTION add_credits(
    user_id TEXT,
    amount INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
    current_balance INTEGER;
BEGIN
    -- 获取当前余额
    SELECT balance INTO current_balance
    FROM user_credits
    WHERE user_credits.user_id = add_credits.user_id;
    
    -- 如果用户不存在，创建新用户
    IF current_balance IS NULL THEN
        INSERT INTO user_credits (user_id, balance, total_used)
        VALUES (add_credits.user_id, 5 + amount, 0);
        current_balance := 5;
    ELSE
        -- 增加积分
        UPDATE user_credits 
        SET 
            balance = balance + amount,
            updated_at = NOW()
        WHERE user_credits.user_id = add_credits.user_id;
    END IF;
    
    -- 记录交易
    INSERT INTO credit_transactions (user_id, amount, type, description, balance_after)
    VALUES (
        add_credits.user_id, 
        amount, 
        'recharge', 
        'Credit purchase',
        current_balance + amount
    );
    
    RETURN TRUE;
END;
$$;

-- 8. 创建人脸交换日志函数
CREATE OR REPLACE FUNCTION log_face_swap(
    user_id TEXT,
    status TEXT DEFAULT 'completed',
    error_msg TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO face_swap_logs (user_id, status, error_message, credits_used)
    VALUES (log_face_swap.user_id, log_face_swap.status, error_msg, 1);
END;
$$;

-- 9. 创建更新时间触发器函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 10. 为用户积分表添加更新时间触发器
DROP TRIGGER IF EXISTS update_user_credits_updated_at ON user_credits;
CREATE TRIGGER update_user_credits_updated_at
    BEFORE UPDATE ON user_credits
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 完成提示
DO $$
BEGIN
    RAISE NOTICE 'Face Swap database setup completed successfully!';
    RAISE NOTICE 'Tables created: user_credits, credit_transactions, face_swap_logs';
    RAISE NOTICE 'Functions created: get_credits, use_credits, add_credits, log_face_swap';
END $$; 