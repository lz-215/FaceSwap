# 支付成功后积分没有增加 - 问题解决方案

## 🔍 问题分析

支付成功后积分没有增加的问题通常涉及以下几个环节：

1. **Stripe Webhook 处理**：支付成功事件是否正确到达并被处理
2. **RLS 策略限制**：Row Level Security 可能阻止 webhook 处理
3. **数据库事务失败**：积分增加的事务可能中途失败
4. **重复处理检测**：可能被误认为重复处理而跳过

## 🛠️ 解决方案

### 1. 立即应用 RLS 修复策略

执行以下 SQL 脚本来修复 RLS 相关问题：

```sql
-- 应用 rls_webhook_fix.sql 中的所有策略
\i rls_webhook_fix.sql
```

### 2. 使用调试脚本检查问题

执行调试脚本来诊断问题：

```sql
-- 应用 debug_payment_credits.sql 来查看数据状态
\i debug_payment_credits.sql
```

### 3. 手动重试失败的支付

如果发现有失败的支付记录，可以使用以下方法重试：

#### 方法 A: 使用数据库 RPC 函数

```sql
-- 重试所有失败的支付
SELECT retry_failed_payments();

-- 手动修复特定用户的积分
SELECT manual_fix_user_credits('YOUR_USER_ID');
```

## 🔧 预防措施

### 1. 监控脚本

运行系统健康检查来监控支付和积分状态。

### 2. 数据库视图创建

创建监控视图来实时查看支付状态：

```sql
-- 创建支付状态监控视图
CREATE VIEW payment_credit_status AS
SELECT 
  cr.id as recharge_id,
  cr.user_id,
  cr.amount as credits,
  cr.status as recharge_status,
  cr.payment_intent_id,
  cr.created_at as payment_time,
  ct.id as transaction_id,
  ct.created_at as credit_time,
  ucb.balance as current_balance,
  CASE 
    WHEN cr.status = 'completed' AND ct.id IS NOT NULL THEN 'SUCCESS'
    WHEN cr.status = 'completed' AND ct.id IS NULL THEN 'MISSING_TRANSACTION'
    WHEN cr.status = 'pending' AND cr.created_at < NOW() - INTERVAL '1 hour' THEN 'STUCK_PENDING'
    ELSE 'PROCESSING'
  END as status_check
FROM credit_recharge cr
LEFT JOIN credit_transaction ct ON cr.id = ct.related_recharge_id
LEFT JOIN user_credit_balance ucb ON cr.user_id = ucb.user_id
WHERE cr.created_at >= NOW() - INTERVAL '7 days'
ORDER BY cr.created_at DESC;
```

## 📋 步骤清单

### 立即修复步骤

- [ ] 1. 应用 RLS webhook 修复脚本 (`rls_webhook_fix.sql`)
- [ ] 2. 运行支付调试脚本 (`debug_payment_credits.sql`)
- [ ] 3. 检查是否有孤立的充值记录
- [ ] 4. 手动修复受影响用户的积分
- [ ] 5. 验证 Stripe webhook 配置

### 长期改进步骤

- [ ] 1. 设置支付状态监控告警
- [ ] 2. 创建自动化健康检查脚本
- [ ] 3. 实施积分余额审计日志
- [ ] 4. 优化 webhook 处理性能

## 🚨 紧急处理指南

如果遇到大量用户积分问题：

### 1. 立即暂停相关功能

```sql
-- 临时禁用积分套餐
UPDATE credit_package SET is_active = false WHERE is_active = true;
```

### 2. 批量修复用户积分

```sql
-- 为所有有问题的用户修复积分
SELECT manual_fix_user_credits(user_id) 
FROM (
  SELECT DISTINCT cr.user_id
  FROM credit_recharge cr
  LEFT JOIN credit_transaction ct ON cr.id = ct.related_recharge_id
  WHERE cr.status = 'completed' 
    AND ct.id IS NULL
    AND cr.created_at >= NOW() - INTERVAL '7 days'
) affected_users;
```

## 📞 技术支持

如果问题仍然存在，请提供以下信息：

1. **用户 ID**
2. **支付时间**
3. **Stripe Payment Intent ID**
4. **预期获得的积分数量**
5. **调试脚本的输出结果** 