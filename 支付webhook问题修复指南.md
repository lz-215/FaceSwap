# 支付Webhook问题修复指南

## 🔍 问题诊断

### 主要问题
支付成功后积分分配失败，错误信息包括：
- `订阅周期时间戳无效`
- `Invalid subscription period timestamps`
- `RPC函数调用失败`

### 根本原因
1. **时间戳验证问题**：`handleSubscriptionBonusCredits` 函数中对 `subscription.current_period_start` 和 `current_period_end` 的验证过于严格
2. **函数参数不匹配**：数据库函数参数名不一致
3. **错误处理不完善**：缺少容错机制

## 🔧 修复步骤

### 步骤1：执行数据库修复脚本

```sql
-- 在Supabase SQL编辑器中运行
\i fix-payment-webhook-complete.sql
```

或者将脚本内容复制到Supabase SQL编辑器中直接执行。

### 步骤2：验证修复结果

```sql
-- 检查函数是否正确创建
SELECT routine_name, routine_type 
FROM information_schema.routines 
WHERE routine_name IN ('recharge_credits_v2', 'handle_payment_success', 'manual_fix_failed_payment')
AND routine_schema = 'public';

-- 测试积分充值功能
SELECT recharge_credits_v2(
    'your-user-id'::UUID,
    10,
    'pi_test_12345',
    '测试充值'
);
```

### 步骤3：监控支付处理

```sql
-- 查看最近的支付记录
SELECT * FROM payment_processing_monitor LIMIT 10;

-- 检查特定支付状态
SELECT check_payment_status('pi_your_payment_intent_id');
```

## 🧪 测试方法

### 1. 基本功能测试

```sql
-- 测试用户积分记录创建
SELECT get_or_create_user_credit_balance('your-user-id'::UUID);

-- 测试积分充值
SELECT recharge_credits_v2(
    'your-user-id'::UUID,
    50,
    'pi_test_payment_123',
    '测试支付充值50积分'
);

-- 测试重复充值（幂等性）
SELECT recharge_credits_v2(
    'your-user-id'::UUID,
    50,
    'pi_test_payment_123',
    '测试重复充值'
);
```

### 2. Webhook处理测试

创建一个测试脚本来模拟Stripe webhook：

```javascript
// test-webhook.js
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function testWebhook() {
  try {
    // 模拟支付成功事件
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 1000,
      currency: 'usd',
      metadata: {
        type: 'credit_recharge',
        userId: 'your-user-id',
        credits: '50',
        rechargeId: 'test-recharge-id'
      }
    });
    
    console.log('测试PaymentIntent创建成功:', paymentIntent.id);
    
    // 发送webhook测试请求
    const response = await fetch('http://localhost:3000/api/webhooks/stripe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': 'test-signature'
      },
      body: JSON.stringify({
        type: 'payment_intent.succeeded',
        data: {
          object: paymentIntent
        }
      })
    });
    
    console.log('Webhook响应:', await response.json());
    
  } catch (error) {
    console.error('测试失败:', error);
  }
}

testWebhook();
```

## 🛠️ 手动修复失败支付

如果有支付成功但积分未到账的情况，可以使用以下方法手动修复：

### 方法1：使用SQL函数

```sql
-- 手动修复失败支付
SELECT manual_fix_failed_payment(
    'user-id'::UUID,
    50,  -- 积分数量
    'pi_failed_payment_intent_id',
    '手动修复失败支付'
);
```

### 方法2：直接充值

```sql
-- 直接为用户充值积分
SELECT recharge_credits_v2(
    'user-id'::UUID,
    50,
    'pi_manual_fix_' || gen_random_uuid(),
    '手动补发积分'
);
```

## 📊 监控和日志

### 查看支付处理日志

```sql
-- 查看所有支付记录
SELECT * FROM payment_processing_monitor 
ORDER BY created_at DESC 
LIMIT 20;

-- 查看特定用户的支付记录
SELECT * FROM payment_processing_monitor 
WHERE user_id = 'your-user-id'
ORDER BY created_at DESC;

-- 查看失败的支付（如果有错误记录表）
SELECT * FROM webhook_errors 
WHERE error_message LIKE '%payment%' 
ORDER BY created_at DESC;
```

### 实时监控

```sql
-- 创建实时监控视图
CREATE OR REPLACE VIEW payment_health_check AS
SELECT 
    COUNT(*) as total_payments_today,
    COUNT(CASE WHEN created_at > NOW() - INTERVAL '1 hour' THEN 1 END) as payments_last_hour,
    SUM(amount) as total_amount_today,
    AVG(amount) as avg_payment_amount
FROM credit_transaction 
WHERE type = 'recharge' 
AND created_at >= CURRENT_DATE;

-- 查看今日支付概况
SELECT * FROM payment_health_check;
```

## 🔍 故障排除

### 常见错误及解决方案

#### 1. 时间戳错误
```
Error: Invalid subscription period timestamps
```
**解决方案**：已修复，现在会跳过时间戳检查但仍然发放积分

#### 2. 函数不存在
```
Error: function recharge_credits_v2 does not exist
```
**解决方案**：执行完整修复脚本重新创建函数

#### 3. 重复支付
```
Error: duplicate key value violates unique constraint
```
**解决方案**：系统已支持幂等性处理，重复支付会被忽略

### 调试步骤

1. **检查函数是否存在**
```sql
SELECT routine_name FROM information_schema.routines 
WHERE routine_name = 'recharge_credits_v2';
```

2. **检查用户积分记录**
```sql
SELECT * FROM user_credit_balance WHERE user_id = 'your-user-id';
```

3. **检查交易记录**
```sql
SELECT * FROM credit_transaction 
WHERE user_id = 'your-user-id' 
ORDER BY created_at DESC;
```

4. **检查webhook日志**
查看应用日志中的 `[webhook]` 标签相关信息

## 📋 部署检查清单

- [ ] 执行数据库修复脚本
- [ ] 验证所有函数正确创建
- [ ] 测试积分充值功能
- [ ] 测试webhook处理
- [ ] 设置监控和告警
- [ ] 备份数据库
- [ ] 更新文档

## 🚨 紧急情况处理

如果出现大量支付失败，请立即：

1. **暂停新支付**：在Stripe控制台临时禁用webhook
2. **评估损失**：统计失败的支付数量和金额
3. **批量修复**：使用以下脚本批量修复

```sql
-- 批量修复脚本（请谨慎使用）
DO $$
DECLARE
    failed_payment RECORD;
BEGIN
    FOR failed_payment IN 
        SELECT DISTINCT 
            metadata->>'payment_intent_id' as payment_intent_id,
            -- 需要从其他地方获取用户ID和积分数量
            'user-id' as user_id,
            50 as credits
        FROM webhook_errors 
        WHERE error_message LIKE '%payment%'
        AND created_at >= CURRENT_DATE
    LOOP
        PERFORM manual_fix_failed_payment(
            failed_payment.user_id::UUID,
            failed_payment.credits,
            failed_payment.payment_intent_id
        );
    END LOOP;
END;
$$;
```

## 📞 联系支持

如果问题依然存在，请提供以下信息：
- 具体的错误消息
- 失败的支付ID (payment_intent_id)
- 用户ID
- 时间戳
- 相关的日志信息

---

**注意**：在生产环境中执行任何修复操作之前，请务必备份数据库！ 