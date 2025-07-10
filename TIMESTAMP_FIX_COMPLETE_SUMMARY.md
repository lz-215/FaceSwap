# 时间戳问题完整修复方案总结

## 🎯 修复概述

我已经为你的系统创建了一个完整的时间戳修复方案，解决了订阅到期、续费、积分过期等所有时间戳相关问题。

## 🔧 已修复的问题

### 1. **时间戳访问错误**
- **问题**：Webhook处理中无法正确访问Stripe订阅的时间戳字段
- **修复**：使用正确的类型断言访问 `subscription.current_period_start` 和 `current_period_end`
- **文件**：`src/app/api/webhooks/stripe/route.ts`

### 2. **时间戳验证过于严格**
- **问题**：缺少时间戳时完全跳过所有处理逻辑
- **修复**：允许在缺少时间戳时仍然处理积分发放，只跳过需要时间戳的数据库同步
- **影响**：确保即使Stripe数据不完整也能正常发放积分

### 3. **缺少积分过期处理**
- **问题**：没有自动处理过期积分的机制
- **修复**：创建了完整的积分过期处理系统
- **功能**：
  - 自动标记过期积分
  - 更新用户余额
  - 记录过期交易
  - 智能积分消费（优先使用即将过期的积分）

### 4. **订阅状态变更处理**
- **问题**：订阅取消、暂停时积分状态不更新
- **修复**：根据订阅状态自动处理积分状态
- **支持状态**：
  - `active` - 发放积分，创建积分记录
  - `canceled` - 标记积分为取消状态
  - `unpaid/past_due` - 标记积分为过期状态
  - `trialing` - 记录状态但不发放积分

## 📁 创建的文件

### 1. **数据库函数** (`timestamp-fix-database-functions.sql`)
```sql
-- 核心功能函数
- consume_credits_smart()           -- 智能积分消费
- expire_subscription_credits()     -- 积分过期处理
- recalculate_user_balance()        -- 重新计算用户余额
- handle_subscription_renewal()     -- 订阅续费处理
- scheduled_expire_credits()        -- 定时任务函数
- sync_subscription_credits_timestamps() -- 时间戳同步
- get_user_credit_details()         -- 用户积分详情查询

-- 监控视图
- subscription_status_monitor       -- 订阅状态监控视图
```

### 2. **API端点** (`src/app/api/credits/expire/route.ts`)
```typescript
// 功能
POST /api/credits/expire  -- 触发积分过期处理
GET /api/credits/expire   -- 查询积分状态
GET /api/credits/expire?userId=xxx -- 查询特定用户积分详情
```

### 3. **验证脚本** (`verify-fixed-subscription-system.sql`)
```sql
-- 检查功能
- 用户积分余额和交易记录检查
- Stripe订阅记录验证
- 系统整体健康检查
- 数据一致性验证
- 订阅状态监控
- Webhook活动跟踪
- 时间戳完整性验证
```

## 🚀 使用指南

### 1. **部署修复**

#### 步骤1：执行数据库函数创建
```sql
-- 在Supabase SQL编辑器中执行
\i timestamp-fix-database-functions.sql
```

#### 步骤2：验证修复结果
```sql
-- 替换为实际用户ID后执行
\i verify-fixed-subscription-system.sql
```

#### 步骤3：设置环境变量
```bash
# 添加到 .env 文件
CREDIT_EXPIRY_API_KEY=your-secure-api-key
```

### 2. **设置定时任务**

#### 选项A：使用cron（推荐）
```bash
# 每小时执行一次积分过期处理
0 * * * * curl -X POST \
  -H "Authorization: Bearer YOUR_API_KEY" \
  https://your-domain.com/api/credits/expire
```

#### 选项B：使用Vercel Cron
```javascript
// vercel.json
{
  "crons": [
    {
      "path": "/api/credits/expire",
      "schedule": "0 * * * *"
    }
  ]
}
```

#### 选项C：直接调用数据库函数
```sql
-- 在Supabase中设置定时任务
SELECT scheduled_expire_credits();
```

### 3. **手动操作**

#### 处理积分过期
```sql
SELECT expire_subscription_credits();
```

#### 重新计算用户余额
```sql
SELECT recalculate_user_balance('user-uuid');
```

#### 查看用户积分详情
```sql
SELECT get_user_credit_details('user-uuid');
```

#### 智能消费积分
```sql
SELECT consume_credits_smart('user-uuid', 5, '人脸交换操作');
```

#### 同步订阅时间戳
```sql
SELECT sync_subscription_credits_timestamps();
```

### 4. **监控和维护**

#### 查看订阅状态
```sql
SELECT * FROM subscription_status_monitor;
```

#### 检查系统健康状态
```bash
curl https://your-domain.com/api/credits/expire
```

#### 查看特定用户状态
```bash
curl https://your-domain.com/api/credits/expire?userId=user-uuid
```

## 🔄 完整的订阅流程

### 新订阅创建
1. Stripe发送 `customer.subscription.created` webhook
2. 系统解析订阅时间戳并同步到数据库
3. 根据订阅金额发放对应积分（月付120，年付1800）
4. 创建 `subscription_credits` 记录，包含过期时间
5. 更新用户积分余额

### 订阅续费
1. Stripe发送 `invoice.payment_succeeded` webhook
2. 系统检测到新的订阅周期
3. 创建新的积分记录（如果不存在）
4. 发放新周期的积分
5. 旧周期积分自然过期

### 订阅取消
1. Stripe发送 `customer.subscription.updated` webhook（状态为canceled）
2. 系统将相关积分标记为 `cancelled`
3. 重新计算用户余额

### 积分消费
1. 用户进行操作（如人脸交换）
2. 系统调用 `consume_credits_smart()` 优先使用即将过期的积分
3. 更新 `subscription_credits` 的 `remaining_credits`
4. 记录消费交易

### 积分过期
1. 定时任务每小时执行
2. 查找所有 `end_date <= NOW()` 的活跃积分
3. 标记为 `expired` 状态，清零 `remaining_credits`
4. 记录过期交易
5. 重新计算受影响用户的余额

## 🎛️ 配置选项

### 积分数量配置
```sql
-- 在 handleSubscriptionBonusCredits 函数中修改
- 月付订阅：$16.90 = 120积分
- 年付订阅：$118.80 = 1800积分
```

### 过期时间配置
```sql
-- 在订阅积分创建时设置
- 月付：30天后过期
- 年付：365天后过期
```

### 定时任务频率
```bash
# 推荐每小时执行一次
0 * * * *    -- 每小时
0 */2 * * *  -- 每2小时
0 0 * * *    -- 每天
```

## 🔍 故障排查

### 问题：积分没有发放
```sql
-- 检查订阅记录
SELECT * FROM stripe_subscription WHERE user_id = 'user-uuid';

-- 检查积分记录
SELECT * FROM subscription_credits WHERE user_id = 'user-uuid';

-- 检查交易记录
SELECT * FROM credit_transaction WHERE user_id = 'user-uuid' 
ORDER BY created_at DESC LIMIT 10;
```

### 问题：余额不一致
```sql
-- 重新计算余额
SELECT recalculate_user_balance('user-uuid');

-- 检查一致性
SELECT * FROM subscription_status_monitor WHERE user_id = 'user-uuid';
```

### 问题：积分没有过期
```sql
-- 手动触发过期处理
SELECT expire_subscription_credits();

-- 检查需要过期的积分
SELECT * FROM subscription_credits 
WHERE status = 'active' AND end_date <= NOW();
```

### 问题：时间戳缺失
```sql
-- 同步时间戳
SELECT sync_subscription_credits_timestamps();

-- 检查时间戳状态
SELECT subscription_id, start_date, end_date, 
       CASE WHEN start_date IS NULL OR end_date IS NULL 
            THEN '缺少时间戳' ELSE '正常' END as status
FROM subscription_credits;
```

## 📊 监控指标

### 关键指标
- 活跃订阅数量
- 总活跃积分
- 即将过期的积分（7天内）
- 已过期但未处理的积分
- 余额不一致的用户数

### 监控查询
```sql
-- 系统健康检查
SELECT 
  (SELECT COUNT(*) FROM subscription_credits WHERE status = 'active') as active_subscriptions,
  (SELECT SUM(remaining_credits) FROM subscription_credits WHERE status = 'active') as total_active_credits,
  (SELECT COUNT(*) FROM subscription_credits WHERE status = 'active' AND end_date <= NOW() + INTERVAL '7 days') as expiring_soon,
  (SELECT COUNT(*) FROM subscription_credits WHERE status = 'active' AND end_date <= NOW()) as should_expire;
```

## 🎉 修复完成

✅ **时间戳处理** - 修复了Stripe订阅时间戳访问问题  
✅ **积分过期** - 实现了完整的积分过期处理机制  
✅ **订阅续费** - 支持自动处理订阅续费和积分发放  
✅ **状态管理** - 完善了订阅取消、暂停等状态处理  
✅ **智能消费** - 优先使用即将过期的积分  
✅ **监控工具** - 提供完整的监控和故障排查工具  
✅ **API接口** - 支持手动触发和定时任务  
✅ **数据一致性** - 确保积分余额和实际记录一致  

你的订阅积分系统现在已经具备了完整的时间戳处理能力，可以正确处理订阅到期、续费、积分过期等所有场景！ 