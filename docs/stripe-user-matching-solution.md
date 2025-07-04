# Stripe 用户匹配问题解决方案

## 问题概述

在Stripe webhook处理过程中，系统需要将Stripe的客户ID（customer_id）与系统中的用户ID进行匹配。当匹配失败时，会出现"找不到用户ID"的错误，导致支付和订阅处理失败。

## 解决方案架构

### 1. 增强的用户匹配器 (`UserMatcher`)

位置: `src/app/api/webhooks/stripe/utils/user-matcher.ts`

**多重匹配策略：**
- **策略1**: 通过 `stripe_customer` 表查找
- **策略2**: 通过 Stripe 客户 metadata 查找
- **策略3**: 通过邮箱匹配用户
- **策略4**: 通过名称模糊匹配

**特点：**
- 自动修复缺失的关联
- 详细的日志记录
- 数据一致性验证

### 2. 改进的 Webhook 处理器

位置: `src/app/api/webhooks/stripe/route.ts`

**改进内容：**
- 使用增强的用户匹配器
- 简化的匹配逻辑
- 更好的错误处理
- 自动记录未匹配的客户

### 3. 管理工具

#### API 端点
位置: `src/app/api/admin/stripe-matcher/route.ts`

**功能：**
- 查看待处理的订阅
- 手动匹配用户ID和客户ID
- 批量自动匹配
- 搜索用户

#### 管理界面
位置: `src/app/admin/stripe-matcher/page.tsx`

**功能：**
- 可视化管理界面
- 实时状态更新
- 批量操作支持

### 4. 预防措施

位置: `src/api/payments/stripe-service.ts`

**增强的客户创建流程：**
- 用户存在性验证
- 重复客户检测
- 自动关联修复
- 详细的错误日志

## 使用指南

### 立即解决问题

1. **检查待处理订阅**
   ```bash
   # 访问管理界面
   https://your-domain.com/admin/stripe-matcher
   ```

2. **批量自动匹配**
   - 在管理界面点击"批量自动匹配"按钮
   - 系统将尝试自动匹配所有待处理的订阅

3. **手动匹配（如果自动匹配失败）**
   - 在"手动匹配"标签页
   - 输入客户ID
   - 搜索并选择对应的用户
   - 点击"手动匹配"执行关联

### API 使用示例

#### 查看待处理订阅
```bash
curl -X GET "https://your-domain.com/api/admin/stripe-matcher?action=pending-subscriptions"
```

#### 自动匹配单个客户
```bash
curl -X POST "https://your-domain.com/api/admin/stripe-matcher" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "auto-match",
    "customerId": "cus_xxxxxxxxxxxxx"
  }'
```

#### 手动匹配
```bash
curl -X POST "https://your-domain.com/api/admin/stripe-matcher" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "manual-match",
    "customerId": "cus_xxxxxxxxxxxxx",
    "userId": "user_id_here",
    "note": "手动修复匹配"
  }'
```

#### 批量匹配
```bash
curl -X POST "https://your-domain.com/api/admin/stripe-matcher" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "batch-match",
    "customerIds": ["cus_xxxxxxxxxxxxx", "cus_yyyyyyyyyyyyy"]
  }'
```

### 监控和维护

#### 1. 定期检查待处理订阅
```sql
SELECT COUNT(*) as pending_count 
FROM stripe_subscription 
WHERE user_id LIKE 'pending_%';
```

#### 2. 验证客户关联
```javascript
import { validateCustomerAssociation } from '~/api/payments/stripe-service';

const isValid = await validateCustomerAssociation(userId, customerId);
```

#### 3. 修复损坏的关联
```javascript
import { fixCustomerAssociation } from '~/api/payments/stripe-service';

await fixCustomerAssociation(userId, customerId);
```

## 预防措施

### 1. 在创建订阅时确保关联
```javascript
// 在创建订阅前验证客户关联
const customer = await createCustomer(userId, email, name);
// customer 现在保证与 userId 正确关联
```

### 2. 在订阅元数据中包含用户ID
```javascript
const subscription = await stripe.subscriptions.create({
  customer: customer.id,
  items: [{ price: priceId }],
  metadata: {
    userId: userId,  // 添加用户ID作为备用
    createdFrom: "api_v2"
  }
});
```

### 3. 定期数据一致性检查
```sql
-- 检查缺失关联的客户
SELECT customer_id 
FROM stripe_subscription s
LEFT JOIN stripe_customer sc ON s.customer_id = sc.customer_id
WHERE sc.customer_id IS NULL;
```

## 故障排除

### 常见问题

1. **自动匹配失败**
   - 检查客户邮箱是否与用户邮箱匹配
   - 验证 Stripe 客户的 metadata
   - 查看日志中的详细错误信息

2. **手动匹配失败**
   - 确认用户ID存在且有效
   - 确认 Stripe 客户ID存在且未删除
   - 检查是否存在重复关联

3. **webhook 仍然失败**
   - 检查新的 webhook 处理器是否部署
   - 验证 `UserMatcher` 类是否正确导入
   - 查看 webhook 日志中的详细错误

### 日志分析

查看 webhook 日志，关注以下关键信息：
```
[UserMatcher] 开始查找用户 - customerId: cus_xxxxx
[UserMatcher] 用户匹配结果: {...}
[webhook] 成功匹配用户: user_123 (方法: email_match, 置信度: medium)
```

### 数据库表结构

确保以下表存在且结构正确：

```sql
-- stripe_customer 表
CREATE TABLE stripe_customer (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    customer_id TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- stripe_subscription 表
CREATE TABLE stripe_subscription (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    subscription_id TEXT NOT NULL UNIQUE,
    product_id TEXT,
    status TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 可选：未匹配客户表
CREATE TABLE unmatched_stripe_customers (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    customer_info JSONB,
    context JSONB,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE
);
```

## 最佳实践

1. **定期运行批量匹配**
   - 建议每天运行一次自动匹配
   - 监控待处理订阅的数量

2. **及时处理新的未匹配记录**
   - 设置告警监控待处理订阅数量
   - 优先处理高价值订阅

3. **保持数据一致性**
   - 定期验证现有关联
   - 及时修复数据不一致问题

4. **日志监控**
   - 监控 webhook 成功率
   - 关注匹配器的置信度分布
   - 跟踪修复操作的成功率

## 支持

如果遇到问题，请：

1. 查看管理界面的实时状态
2. 检查相关日志文件
3. 使用 API 工具进行诊断
4. 必要时执行手动修复操作

---

**注意**: 本解决方案已经考虑了数据安全和一致性，但在生产环境中使用前，请确保已经进行了充分的测试。 