-- AIFaceSwap 简化版数据库函数

-- 1. 消费积分函数 (简化版)
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

-- 2. 充值积分函数 (简化版)
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

-- 3. 获取用户积分函数 (简化版)
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

-- 4. 记录人脸交换日志函数
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