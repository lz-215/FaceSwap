# 移除Drizzle ORM 完整指南

## 🎯 概述

你的项目实际上已经很大程度上不依赖Drizzle进行数据库操作了！Drizzle主要用于类型定义和迁移管理，而实际的数据库操作都通过Supabase HTTP API进行。

## 📊 当前状况

### ✅ 已经使用Supabase的部分
- 所有API路由中的数据库操作
- 认证系统 (`@supabase/ssr`)
- 文件存储
- 实时功能
- Webhook处理

### 🔄 仍在使用Drizzle的部分
- 类型定义 (`src/db/schema/`)
- 数据库迁移 (`drizzle/`)
- 配置文件 (`drizzle.config.ts`)

## 🚀 完全移除Drizzle的步骤

### 第1步：使用新的类型定义

我们已经创建了 `src/lib/database-types.ts` 来替代Drizzle的schema定义。

### 第2步：更新所有导入语句

查找并替换所有Drizzle schema的导入：

```bash
# 查找需要更新的文件
grep -r "~/db/schema" src/
grep -r "from.*drizzle" src/
```

将以下导入：
```typescript
// 旧的导入
import type { User } from "~/db/schema/users/types";
import type { CreditTransaction } from "~/db/schema/credits/types";

// 替换为
import type { User, CreditTransaction } from "~/lib/database-types";
```

### 第3步：删除Drizzle文件和依赖

运行准备好的脚本：
```bash
chmod +x scripts/remove-drizzle.sh
./scripts/remove-drizzle.sh
```

或手动执行：
```bash
# 删除文件和目录
rm -rf drizzle/
rm -f drizzle.config.ts
rm -rf src/db/schema/
```

### 第4步：清理package.json

从 `package.json` 中移除：

```json
{
  "dependencies": {
    // 移除这些
    "drizzle-orm": "^0.43.1",
    "@types/pg": "^8.15.0",
    "pg": "^8.15.6",
    "postgres": "^3.4.5"
  },
  "devDependencies": {
    // 移除这些
    "drizzle-kit": "^0.31.1"
  },
  "scripts": {
    // 移除这些
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio"
  }
}
```

### 第5步：重新安装依赖

```bash
bun install
```

## 📋 替代方案

### 数据库架构管理

**替代方式**: 使用现有的SQL文件
- `src/db/sql/create-tables.sql` - 完整的表结构
- `src/db/sql/webhook-functions.sql` - 函数定义
- `src/db/sql/credit-functions.sql` - 积分系统函数

### 数据库迁移

**替代方式**: 直接在Supabase Dashboard执行SQL
1. 打开Supabase Dashboard
2. 进入 SQL Editor
3. 执行所需的SQL文件

### 类型安全

**替代方式**: 使用我们创建的 `database-types.ts`
- ✅ 完整的TypeScript类型定义
- ✅ 与Supabase完美兼容
- ✅ 更简单直接

## 🔄 数据库操作最佳实践

### 1. 查询示例
```typescript
import { createClient } from "~/lib/supabase/server";
import type { User, CreditTransaction } from "~/lib/database-types";

// 获取用户
export async function getUser(id: string): Promise<User | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('user')
    .select('*')
    .eq('id', id)
    .single();
  
  return error ? null : data;
}

// 插入积分交易
export async function createCreditTransaction(
  transaction: Omit<CreditTransaction, 'id' | 'created_at'>
): Promise<CreditTransaction | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('credit_transaction')
    .insert(transaction)
    .select()
    .single();
  
  return error ? null : data;
}
```

### 2. RPC函数调用
```typescript
// 调用数据库函数
const { data, error } = await supabase.rpc('handle_stripe_webhook_payment_success', {
  p_payment_intent_id: paymentIntentId,
  p_recharge_id: rechargeId
});
```

### 3. 事务处理
Supabase会自动处理事务，或者使用RPC函数来确保数据一致性。

## ✅ 验证移除成功

运行以下命令确认移除成功：

```bash
# 确认没有Drizzle导入
grep -r "drizzle" src/

# 确认没有schema导入
grep -r "~/db/schema" src/

# 确认TypeScript编译正常
bun run check
```

## 🎉 移除后的优势

1. **更简单**: 不需要学习和维护Drizzle API
2. **更直接**: 直接使用Supabase的强大功能
3. **更快**: 减少了一层抽象，提高性能
4. **更灵活**: 可以使用Supabase的所有功能（RLS、RPC、订阅等）
5. **更轻量**: 减少bundle大小和依赖

## 🔧 如果遇到问题

### TypeScript错误
- 确保所有导入都已更新到 `~/lib/database-types`
- 检查类型定义是否完整

### 运行时错误
- 确保数据库表结构与类型定义匹配
- 检查Supabase客户端配置

### 数据库操作问题
- 使用Supabase Dashboard的SQL Editor调试
- 检查RLS策略是否正确设置

---

**记住**: 你的项目已经在很大程度上使用Supabase了，移除Drizzle只是清理不需要的抽象层！ 