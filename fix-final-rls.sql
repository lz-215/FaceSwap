-- =================================================================
-- 最终 RLS 权限修复
-- 确保 service_role 对 user_profiles 和 subscription_credits 有完全权限
-- =================================================================

BEGIN;

-- 1. 为 user_profiles 表添加 RLS 策略
-- 允许 service_role 执行所有操作 (SELECT, INSERT, UPDATE, DELETE)
-- 这是必需的，以便 webhook 可以更新用户的 subscription_status
DROP POLICY IF EXISTS "Service role can manage user profiles" ON public.user_profiles;
CREATE POLICY "Service role can manage user profiles"
    ON public.user_profiles
    FOR ALL
    USING (auth.role() = 'service_role');

-- 允许用户查看和修改自己的个人资料
DROP POLICY IF EXISTS "Users can manage their own profile" ON public.user_profiles;
CREATE POLICY "Users can manage their own profile"
    ON public.user_profiles
    FOR ALL
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);


-- 2. 重新确认 subscription_credits 表的 RLS 策略
-- 确保 service_role 有权插入记录以防止重复发放积分
DROP POLICY IF EXISTS "Service role can manage subscription credits" ON public.subscription_credits;
CREATE POLICY "Service role can manage subscription credits"
    ON public.subscription_credits
    FOR ALL
    USING (auth.role() = 'service_role');

-- 允许用户查看自己的订阅积分记录
DROP POLICY IF EXISTS "Users can view own subscription credits" ON public.subscription_credits;
CREATE POLICY "Users can view own subscription credits"
    ON public.subscription_credits
    FOR SELECT
    USING (auth.uid() = user_id);

COMMIT; 