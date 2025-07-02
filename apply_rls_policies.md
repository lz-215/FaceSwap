# Face Swap 应用 RLS 策略应用指南

## 概述

本文档说明如何将数据库访问方式改为 Row Level Security (RLS)，确保用户只能访问自己的数据，提高应用的安全性。

## 当前状态

项目目前使用 Supabase 作为数据库，已经在表级别启用了 RLS，但缺少具体的安全策略。我们需要：

1. 为所有用户数据表添加 RLS 策略
2. 确保用户只能访问自己的数据
3. 为公共表（如价格套餐）提供适当的访问权限
4. 优化性能

## 文件结构

```
face-swap-build/
├── rls_policies.sql          # 完整的 RLS 策略定义
├── apply_rls_policies.md     # 本文档
└── supabase_schema.sql       # 原始数据库架构
```

## 应用步骤

### 1. 备份数据库

在应用 RLS 策略之前，请先备份数据库：

```bash
# 如果使用 Supabase CLI
supabase db dump > backup_$(date +%Y%m%d_%H%M%S).sql
```

### 2. 应用 RLS 策略

有两种方式应用策略：

#### 方式 A: 通过 Supabase Dashboard

1. 登录 Supabase Dashboard
2. 进入 SQL Editor
3. 复制 `rls_policies.sql` 的内容
4. 执行 SQL

#### 方式 B: 通过命令行

```bash
# 如果使用 Supabase CLI
supabase db reset --local
# 然后应用新的策略
psql -h localhost -p 54322 -U postgres -d postgres -f rls_policies.sql
```

### 3. 验证策略

执行以下查询来验证策略是否正确应用：

```sql
-- 检查已启用 RLS 的表
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' AND rowsecurity = true;

-- 检查策略数量
SELECT COUNT(*) as policy_count 
FROM pg_policies 
WHERE schemaname = 'public';

-- 查看具体策略
SELECT schemaname, tablename, policyname, cmd, roles 
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, cmd;
```

## 策略说明

### 用户数据表策略

对于包含用户数据的表，我们实施了以下策略：

- **SELECT**: 用户只能查看自己的数据 (`user_id = auth.uid()`)
- **INSERT**: 用户只能插入自己的数据
- **UPDATE**: 用户只能更新自己的数据
- **DELETE**: 用户只能删除自己的数据

涉及的表：
- `user` (用户表)
- `session` (会话表)
- `account` (OAuth账户表)
- `two_factor` (两步验证表)
- `user_credit_balance` (用户积分余额)
- `credit_recharge` (积分充值记录)
- `credit_transaction` (积分交易记录)
- `uploads` (文件上传记录)
- `face_swap_history` (人脸交换历史)
- `stripe_customer` (Stripe客户信息)
- `stripe_subscription` (订阅信息)

### 公共表策略

对于公共配置表，我们允许所有用户（包括匿名用户）读取：

- `credit_package` (积分套餐 - 只允许查看激活的套餐)
- `credit_consumption_config` (积分消费配置 - 只允许查看激活的配置)

### 特殊表策略

#### verification 表
验证表用于邮箱验证等流程，需要特殊处理：
- 允许匿名和认证用户进行所有操作
- 用于邮箱验证、密码重置等功能

## 性能优化

### 索引优化

我们为所有 `user_id` 列添加了索引以提高 RLS 策略的性能：

```sql
CREATE INDEX IF NOT EXISTS idx_table_name_user_id ON table_name(user_id);
```

### 策略优化

- 使用 `(SELECT auth.uid())` 而不是 `auth.uid()` 来利用 PostgreSQL 的 initPlan 优化
- 为策略指定明确的角色 (`TO authenticated`)
- 避免复杂的 JOIN 操作在策略中

## 应用代码修改

### Supabase 客户端配置

确保 Supabase 客户端正确配置：

```typescript
// src/lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'

export async function createClient() {
  const cookieStore = await cookies()
  
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // RLS 需要正确的 cookie 配置
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        // ... 其他配置
      },
    },
  )
}
```

### 数据访问模式

使用 RLS 后，数据访问变得更简单和安全：

```typescript
// 查询用户自己的数据（RLS 自动过滤）
const { data: userCredits } = await supabase
  .from('user_credit_balance')
  .select('*')
  // 不需要 .eq('user_id', userId) - RLS 自动处理

// 插入数据时确保 user_id 正确
const { data, error } = await supabase
  .from('face_swap_history')
  .insert({
    user_id: user.id, // 必须匹配当前认证用户
    origin_image_url: '...',
    // ... 其他字段
  })
```

## 测试

### 基本测试

1. **认证测试**: 确保未认证用户无法访问用户数据
2. **授权测试**: 确保用户A无法访问用户B的数据
3. **功能测试**: 确保正常功能（注册、登录、文件上传、人脸交换）正常工作

### 测试查询

```sql
-- 测试用户隔离（应该返回空结果或错误）
SET request.jwt.claims TO '{"sub": "user-a-id"}';
SELECT * FROM user_credit_balance WHERE user_id = 'user-b-id';

-- 测试公共表访问（应该成功）
SELECT * FROM credit_package WHERE is_active = true;
```

## 故障排除

### 常见问题

1. **无法访问数据**: 确保用户已正确认证且 JWT 包含正确的用户ID
2. **性能问题**: 检查是否添加了必要的索引
3. **策略冲突**: 确保没有重复或冲突的策略

### 调试查询

```sql
-- 检查当前用户
SELECT auth.uid();

-- 检查策略执行
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM user_credit_balance;

-- 查看策略定义
SELECT * FROM pg_policies WHERE tablename = 'user_credit_balance';
```

## 安全注意事项

1. **服务密钥使用**: 某些后台操作可能需要使用 service role key 来绕过 RLS
2. **API 端点保护**: 确保 API 路由也有适当的认证检查
3. **客户端安全**: 永远不要在客户端代码中暴露 service role key
4. **定期审计**: 定期检查和审核 RLS 策略

## 回滚计划

如果需要回滚 RLS 策略：

```sql
-- 禁用所有表的 RLS
ALTER TABLE public."user" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.session DISABLE ROW LEVEL SECURITY;
-- ... 对所有表执行

-- 删除所有策略
DROP POLICY IF EXISTS "policy_name" ON table_name;
-- ... 删除所有策略
```

## 结论

通过实施 RLS，我们显著提高了应用的安全性：

- 用户数据完全隔离
- 减少了应用层的安全检查代码
- 提供了数据库级别的安全保障
- 保持了良好的性能

在生产环境中部署前，请确保充分测试所有功能并验证安全策略的正确性。 