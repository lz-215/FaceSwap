# Face-Swap 数据库设置指南

## 概述

这个文档提供了 Face-Swap 项目的完整数据库设置指南。包含了所有必要的表、函数、策略和最佳实践。

## 快速开始

### 1. 执行数据库初始化脚本

```sql
-- 在 Supabase SQL 编辑器中执行
\i database_complete_setup.sql
```

或者复制粘贴 `database_complete_setup.sql` 的内容到 Supabase Dashboard 的 SQL 编辑器中执行。

### 2. 验证安装

执行以下查询来验证所有表是否正确创建：

```sql
-- 检查所有表
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

-- 检查所有函数
SELECT proname FROM pg_proc WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public') ORDER BY proname;

-- 检查所有视图
SELECT viewname FROM pg_views WHERE schemaname = 'public' ORDER BY viewname;
```

## 数据库架构详解

### 核心表结构

#### 1. 用户系统
- **`auth.users`**: Supabase 认证表（系统表）
- **`user_profiles`**: 用户扩展信息，包含 Stripe 客户ID 等

#### 2. 积分系统
- **`user_credit_balance`**: 用户积分余额主表
- **`credit_transaction`**: 所有积分变动记录
- **`subscription_credits`**: 订阅产生的积分

#### 3. 订阅系统
- **`subscription_status_monitor`**: 订阅状态监控（完整信息）

#### 4. 业务系统
- **`face_swap_histories`**: 人脸交换操作记录

#### 5. 日志系统
- **`webhook_failures`**: Webhook 失败记录
- **`webhook_errors`**: Webhook 错误日志

### 关键视图

#### 1. `active_subscriptions_view`
显示所有有效的订阅积分：
```sql
SELECT * FROM active_subscriptions_view WHERE user_id = 'your-user-id';
```

#### 2. `user_credits_summary`
用户积分完整汇总：
```sql
SELECT * FROM user_credits_summary WHERE user_id = 'your-user-id';
```

## 核心函数使用指南

### 1. 用户管理

#### 创建或更新用户配置
```sql
SELECT upsert_user_profile_with_email(
    'user-uuid',
    'user@example.com',
    '显示名称',
    '名',
    '姓',
    'https://avatar-url.com/image.jpg',
    'stripe-customer-id'
);
```

#### 获取或创建用户积分余额
```sql
SELECT * FROM get_or_create_user_credit_balance('user-uuid');
```

### 2. 积分管理

#### 实时获取用户余额
```sql
SELECT get_user_balance_realtime('user-uuid');
```

#### 原子化积分消费
```sql
SELECT consume_credits_atomic(
    'user-uuid',
    1,  -- 消费1积分
    '人脸交换消费'
);
```

#### 添加积分
```sql
SELECT add_credits_and_log_transaction(
    'user-uuid',
    100,  -- 添加100积分
    '积分充值',
    '{"payment_method": "stripe", "amount": 1690}'::jsonb
);
```

### 3. 订阅管理

#### 添加订阅积分
```sql
INSERT INTO subscription_credits (
    user_id,
    subscription_id,
    credits,
    remaining_credits,
    start_date,
    end_date,
    status
) VALUES (
    'user-uuid',
    'sub_stripe_subscription_id',
    120,
    120,
    NOW(),
    NOW() + INTERVAL '1 month',
    'active'
);
```

#### 处理过期积分
```sql
SELECT expire_credits();
```

## 安全策略 (RLS)

### 策略概览
所有用户数据表都启用了行级安全（RLS），确保：

1. **用户隔离**: 用户只能访问自己的数据
2. **服务角色权限**: 后端服务可以管理所有数据
3. **只读视图**: 用户可以查看汇总信息

### 权限级别

#### 普通用户 (`authenticated` role)
- ✅ 查看自己的配置、积分、交易记录
- ✅ 更新自己的配置
- ✅ 查看汇总视图
- ❌ 修改积分余额
- ❌ 查看其他用户数据

#### 服务角色 (`service_role`)
- ✅ 管理所有数据
- ✅ 执行所有函数
- ✅ 访问日志表

## 常用查询示例

### 1. 获取用户完整积分状态
```sql
SELECT 
    current_balance,
    total_recharged,
    total_consumed,
    active_subscription_credits,
    active_subscription_count
FROM user_credits_summary 
WHERE user_id = 'your-user-id';
```

### 2. 获取用户积分交易历史
```sql
SELECT 
    type,
    amount,
    balance_after,
    description,
    created_at
FROM credit_transaction 
WHERE user_id = 'your-user-id'
ORDER BY created_at DESC
LIMIT 10;
```

### 3. 检查用户订阅状态
```sql
SELECT 
    subscription_id,
    status,
    remaining_credits,
    end_date,
    CASE 
        WHEN end_date <= NOW() THEN 'expired'
        WHEN end_date <= NOW() + INTERVAL '7 days' THEN 'expiring_soon'
        ELSE 'active'
    END as computed_status
FROM subscription_credits 
WHERE user_id = 'your-user-id'
AND status = 'active';
```

### 4. 获取人脸交换历史
```sql
SELECT 
    result_image_path,
    origin_image_url,
    description,
    created_at
FROM face_swap_histories 
WHERE user_id = 'your-user-id'
ORDER BY created_at DESC
LIMIT 20;
```

## 维护和监控

### 1. 定期任务

#### 清理过期积分（建议每日执行）
```sql
SELECT expire_credits();
```

#### 清理旧日志（建议每周执行）
```sql
SELECT cleanup_old_logs();
```

### 2. 监控查询

#### 检查系统健康状态
```sql
-- 检查用户总数
SELECT COUNT(*) as total_users FROM auth.users;

-- 检查活跃订阅数
SELECT COUNT(*) as active_subscriptions FROM active_subscriptions_view;

-- 检查今日积分交易
SELECT 
    type,
    COUNT(*) as transaction_count,
    SUM(amount) as total_amount
FROM credit_transaction 
WHERE created_at >= CURRENT_DATE
GROUP BY type;
```

#### 检查错误日志
```sql
-- 最近的 webhook 错误
SELECT * FROM webhook_errors 
ORDER BY created_at DESC 
LIMIT 10;

-- 最近的 webhook 失败
SELECT * FROM webhook_failures 
ORDER BY created_at DESC 
LIMIT 10;
```

## 数据迁移

### 从旧版本迁移

如果您之前有旧的数据库结构，可以使用以下步骤：

1. **备份现有数据**
```sql
-- 导出用户数据
COPY (SELECT * FROM old_table) TO 'backup.csv' WITH CSV HEADER;
```

2. **执行新的初始化脚本**
```sql
\i database_complete_setup.sql
```

3. **迁移数据**
```sql
-- 示例：迁移用户积分
INSERT INTO user_credit_balance (user_id, balance, total_recharged, total_consumed)
SELECT user_id, balance, recharged, consumed FROM old_credit_table
ON CONFLICT (user_id) DO NOTHING;
```

## 性能优化

### 1. 索引使用
脚本已经创建了所有必要的索引：
- 用户查询优化（user_id 索引）
- 时间序列查询优化（created_at 索引）
- 复合索引优化（user_id + created_at）

### 2. 查询优化建议

#### 使用预计算视图
```sql
-- ✅ 好的做法
SELECT * FROM user_credits_summary WHERE user_id = $1;

-- ❌ 避免复杂的实时计算
SELECT 
    (SELECT balance FROM user_credit_balance WHERE user_id = $1) +
    (SELECT SUM(remaining_credits) FROM subscription_credits WHERE user_id = $1)
as total_balance;
```

#### 使用批量操作
```sql
-- ✅ 批量插入交易记录
INSERT INTO credit_transaction (user_id, type, amount, balance_after, description)
SELECT user_id, 'bonus', 10, balance + 10, '注册奖励'
FROM user_credit_balance
WHERE created_at >= CURRENT_DATE;
```

## 故障排除

### 常见问题

#### 1. RLS 策略阻止访问
```sql
-- 检查当前用户角色
SELECT current_role;

-- 检查用户ID
SELECT auth.uid();

-- 临时禁用 RLS（仅用于调试）
ALTER TABLE table_name DISABLE ROW LEVEL SECURITY;
```

#### 2. 函数执行错误
```sql
-- 检查函数权限
SELECT has_function_privilege('function_name(args)', 'execute');

-- 查看函数定义
\df+ function_name
```

#### 3. 积分计算不准确
```sql
-- 重新计算用户余额
WITH real_balance AS (
    SELECT 
        user_id,
        COALESCE(balance, 0) + COALESCE(subscription_credits, 0) as total
    FROM user_credit_balance ucb
    LEFT JOIN (
        SELECT user_id, SUM(remaining_credits) as subscription_credits
        FROM active_subscriptions_view
        GROUP BY user_id
    ) sub ON ucb.user_id = sub.user_id
    WHERE ucb.user_id = 'your-user-id'
)
SELECT * FROM real_balance;
```

## 最佳实践

### 1. 开发建议
- 总是使用提供的函数进行积分操作
- 避免直接修改余额表
- 使用事务确保数据一致性
- 记录所有重要操作到交易表

### 2. 安全建议
- 定期检查 RLS 策略
- 监控异常的积分变动
- 备份关键数据
- 使用最小权限原则

### 3. 性能建议
- 定期清理日志表
- 监控长时间运行的查询
- 使用适当的索引
- 考虑数据分区（如果数据量很大）

## 支持

如果您在使用过程中遇到问题，请检查：

1. 所有表是否正确创建
2. RLS 策略是否正确配置
3. 函数权限是否正确设置
4. 数据类型是否匹配

这个数据库设计支持完整的 SaaS 积分和订阅系统，具有良好的扩展性和安全性。