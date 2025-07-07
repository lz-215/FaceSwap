-- =================================================================
-- 数据库状态检查脚本
-- 在运行 clean-rebuild-fixed.sql 之前检查当前数据库状态
-- =================================================================

SELECT '====== 数据库状态检查报告 ======' as status_report;

-- 检查当前存在的表
SELECT '检查现有表:' as step;

SELECT 
    schemaname,
    tablename,
    CASE 
        WHEN tablename = 'user' THEN '❌ 旧用户表 - 将被删除'
        WHEN tablename = 'user_profiles' THEN '✅ 新用户配置表 - 已存在'
        WHEN tablename = 'user_credit_balance' THEN '✅ 积分余额表'
        WHEN tablename = 'credit_transaction' THEN '✅ 积分交易表'
        WHEN tablename = 'face_swap_histories' THEN '✅ 人脸交换历史表'
        WHEN tablename = 'stripe_subscription' THEN '✅ Stripe订阅表'
        WHEN tablename = 'subscription_credits' THEN '✅ 订阅积分表'
        ELSE '🔍 其他表'
    END as status
FROM pg_tables 
WHERE schemaname = 'public' 
    AND tablename IN (
        'user', 'user_profiles', 'user_credit_balance', 
        'credit_transaction', 'face_swap_histories', 
        'stripe_subscription', 'subscription_credits',
        'stripe_customer'
    )
ORDER BY tablename;

-- 检查是否有数据
SELECT '检查表数据行数:' as step;

DO $$
DECLARE
    table_record RECORD;
    row_count INTEGER;
    sql_text TEXT;
BEGIN
    FOR table_record IN 
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public' 
            AND tablename IN ('user', 'user_profiles', 'user_credit_balance', 'credit_transaction', 'face_swap_histories')
    LOOP
        sql_text := 'SELECT COUNT(*) FROM ' || quote_ident(table_record.tablename);
        EXECUTE sql_text INTO row_count;
        RAISE NOTICE '表 %: % 行数据', table_record.tablename, row_count;
    END LOOP;
END $$;

-- 检查重要函数是否存在
SELECT '检查函数:' as step;

SELECT 
    routine_name,
    routine_type,
    CASE 
        WHEN routine_name LIKE 'get_or_create_user_credit_balance%' THEN '🔄 积分余额函数'
        WHEN routine_name = 'upsert_user_profile' THEN '🔄 用户配置函数'
        ELSE '📋 其他函数'
    END as description
FROM information_schema.routines 
WHERE routine_schema = 'public' 
    AND routine_name IN (
        'get_or_create_user_credit_balance',
        'upsert_user_profile',
        'update_updated_at_column',
        'handle_subscription_payment_success',
        'consume_credits'
    );

-- 检查认证用户（auth.users）
SELECT '检查 auth.users 表:' as step;

SELECT 
    COUNT(*) as auth_users_count,
    MIN(created_at) as oldest_user,
    MAX(created_at) as newest_user
FROM auth.users;

-- 提供建议
SELECT '====== 建议操作 ======' as recommendations;

SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user') 
        THEN '✅ 可以安全运行 clean-rebuild-fixed.sql - 检测到旧 user 表'
        WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_profiles')
        THEN '⚠️  新架构已存在 - 请谨慎操作'
        ELSE '❓ 未检测到用户表 - 请确认数据库状态'
    END as recommendation;

-- 显示下一步操作
SELECT '====== 下一步操作 ======' as next_steps;

SELECT '1. 如果确认要重建数据库，运行: clean-rebuild-fixed.sql' as step_1;
SELECT '2. 重建后请运行认证测试确保系统正常' as step_2;
SELECT '3. 建议先备份重要数据' as step_3; 