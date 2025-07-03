-- 创建 stripe_subscription 表（如果不存在）
CREATE TABLE IF NOT EXISTS stripe_subscription (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    subscription_id TEXT UNIQUE NOT NULL,
    product_id TEXT,
    status TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_stripe_subscription_user_id ON stripe_subscription(user_id);
CREATE INDEX IF NOT EXISTS idx_stripe_subscription_customer_id ON stripe_subscription(customer_id);
CREATE INDEX IF NOT EXISTS idx_stripe_subscription_subscription_id ON stripe_subscription(subscription_id);

-- 添加注释
COMMENT ON TABLE stripe_subscription IS 'Stripe订阅信息表';
COMMENT ON COLUMN stripe_subscription.id IS '主键';
COMMENT ON COLUMN stripe_subscription.user_id IS '用户ID';
COMMENT ON COLUMN stripe_subscription.customer_id IS 'Stripe客户ID';
COMMENT ON COLUMN stripe_subscription.subscription_id IS 'Stripe订阅ID';
COMMENT ON COLUMN stripe_subscription.product_id IS '产品ID';
COMMENT ON COLUMN stripe_subscription.status IS '订阅状态';
COMMENT ON COLUMN stripe_subscription.metadata IS '订阅元数据';
COMMENT ON COLUMN stripe_subscription.created_at IS '创建时间';
COMMENT ON COLUMN stripe_subscription.updated_at IS '更新时间';

-- 创建更新时间触发器
CREATE OR REPLACE FUNCTION update_stripe_subscription_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_stripe_subscription_updated_at ON stripe_subscription;
CREATE TRIGGER update_stripe_subscription_updated_at
    BEFORE UPDATE ON stripe_subscription
    FOR EACH ROW
    EXECUTE FUNCTION update_stripe_subscription_updated_at(); 