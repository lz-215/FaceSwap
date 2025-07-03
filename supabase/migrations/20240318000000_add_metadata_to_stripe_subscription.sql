-- 为 stripe_subscription 表添加 metadata 列
ALTER TABLE IF EXISTS stripe_subscription
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- 更新现有记录的 metadata 列
UPDATE stripe_subscription
SET metadata = '{}'::jsonb
WHERE metadata IS NULL;

-- 添加注释
COMMENT ON COLUMN stripe_subscription.metadata IS '存储订阅相关的元数据，如关联方式、时间等'; 