-- =================================================================
-- RLS策略修复：为 subscription_status_monitor 表添加策略
-- =================================================================

-- 1. 确保 subscription_status_monitor 表启用了RLS
-- 如果尚未启用，此命令会启用它。如果已启用，则无任何影响。
ALTER TABLE public.subscription_status_monitor ENABLE ROW LEVEL SECURITY;

-- 2. 删除可能存在的旧的、不正确的服务角色策略（以防万一）
DROP POLICY IF EXISTS "Service role can manage subscription monitor" ON public.subscription_status_monitor;

-- 3. 创建一个新的、正确的策略，允许服务角色进行所有操作
-- 这是最关键的一步，它将允许 webhook 成功写入数据
CREATE POLICY "Service role can manage subscription monitor"
ON public.subscription_status_monitor
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 4. （可选）为普通用户添加只读策略
-- 这允许用户读取与自己相关的订阅状态，但不能修改
DROP POLICY IF EXISTS "Users can view their own subscription status" ON public.subscription_status_monitor;

CREATE POLICY "Users can view their own subscription status"
ON public.subscription_status_monitor
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

COMMENT ON POLICY "Service role can manage subscription monitor" ON public.subscription_status_monitor IS '允许服务角色（例如在Edge Function中）对订阅监控表进行完全的增删改查操作。';
COMMENT ON POLICY "Users can view their own subscription status" ON public.subscription_status_monitor IS '允许已登录用户查看自己的订阅状态记录。';
