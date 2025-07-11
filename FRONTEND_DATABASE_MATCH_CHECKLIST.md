# 前端与数据库匹配验证清单

## 概述
这个文档确保前端代码中使用的所有数据库表、字段和函数都与数据库脚本完全匹配。

## 执行顺序
请按以下顺序执行数据库脚本：

1. **首先执行**: `database_complete_setup.sql` (创建所有表、基础函数、RLS策略)
2. **然后执行**: `database_missing_functions.sql` (添加前端需要的缺失函数)

## ✅ 数据库表匹配验证

### 用户相关表
- [x] `user_profiles` - 用户扩展信息表
  - [x] `id` (UUID) - 主键
  - [x] `email` (TEXT) - 邮箱
  - [x] `display_name` (TEXT) - 显示名称  
  - [x] `first_name` (TEXT) - 名
  - [x] `last_name` (TEXT) - 姓
  - [x] `avatar_url` (TEXT) - 头像URL
  - [x] `customer_id` (TEXT) - Stripe客户ID
  - [x] `subscription_status` (TEXT) - 订阅状态
  - [x] `project_id` (TEXT) - 项目ID

### 积分相关表
- [x] `user_credit_balance` - 用户积分余额表
  - [x] `user_id` (UUID) - 用户ID  
  - [x] `balance` (INTEGER) - 当前余额
  - [x] `total_recharged` (INTEGER) - 总充值
  - [x] `total_consumed` (INTEGER) - 总消费

- [x] `credit_transaction` - 积分交易记录表
  - [x] `id` (UUID) - 主键
  - [x] `user_id` (UUID) - 用户ID
  - [x] `type` (TEXT) - 交易类型
  - [x] `amount` (INTEGER) - 交易金额
  - [x] `balance_after` (INTEGER) - 交易后余额
  - [x] `description` (TEXT) - 描述
  - [x] `related_subscription_id` (TEXT) - 关联订阅ID
  - [x] `metadata` (JSONB) - 元数据
  - [x] `created_at` (TIMESTAMP) - 创建时间

### 订阅相关表
- [x] `subscription_credits` - 订阅积分表
  - [x] `user_id` (UUID) - 用户ID
  - [x] `subscription_id` (TEXT) - 订阅ID
  - [x] `credits` (INTEGER) - 总积分
  - [x] `remaining_credits` (INTEGER) - 剩余积分
  - [x] `start_date` (TIMESTAMP) - 开始时间
  - [x] `end_date` (TIMESTAMP) - 结束时间
  - [x] `status` (TEXT) - 状态

- [x] `subscription_status_monitor` - 订阅状态监控表
  - [x] `user_id` (UUID) - 用户ID
  - [x] `subscription_id` (TEXT) - 订阅ID
  - [x] `status` (TEXT) - 状态
  - [x] `total_credits` (INTEGER) - 总积分
  - [x] `remaining_credits` (INTEGER) - 剩余积分
  - [x] `stripe_status` (TEXT) - Stripe状态

### 业务相关表
- [x] `face_swap_histories` - 人脸交换历史表
  - [x] `user_id` (UUID) - 用户ID
  - [x] `result_image_path` (TEXT) - 结果图片路径
  - [x] `origin_image_url` (TEXT) - 原始图片URL
  - [x] `description` (TEXT) - 描述
  - [x] `project_id` (TEXT) - 项目ID

### 日志相关表
- [x] `webhook_failures` - Webhook失败记录
- [x] `webhook_errors` - Webhook错误记录

## ✅ 数据库函数匹配验证

### 积分查询函数 (来自 use-credits-v2.ts)
- [x] `get_user_credits_v2(p_user_id UUID)` 
  - **前端调用**: `supabaseClient.rpc('get_user_credits_v2', { p_user_id: user.id })`
  - **返回格式**: `{ balance, totalRecharged, totalConsumed, createdAt, updatedAt }`
  - **状态**: ✅ 已实现

### 积分查询函数 (来自 use-simple-credits.ts)
- [x] `get_credits(user_id UUID)`
  - **前端调用**: `supabaseClient.rpc('get_credits', { user_id: user.id })`
  - **返回格式**: `INTEGER` (余额数字)
  - **状态**: ✅ 已实现

### 积分消费函数 (来自 use-credits-v2.ts)
- [x] `consume_credits_v2(p_user_id, action_type, amount_override, transaction_description)`
  - **前端调用**: `supabaseClient.rpc('consume_credits_v2', { ... })`
  - **返回格式**: `{ success, balanceAfter, amountConsumed }`
  - **状态**: ✅ 已实现

### 积分消费函数 (来自 use-simple-credits.ts)  
- [x] `use_credits(user_id, amount)`
  - **前端调用**: `supabaseClient.rpc('use_credits', { user_id, amount })`
  - **返回格式**: `BOOLEAN`
  - **状态**: ✅ 已实现

### 积分充值函数 (来自 use-credits-v2.ts)
- [x] `recharge_credits_v2(p_user_id, amount_to_add, payment_intent_id, transaction_description)`
  - **前端调用**: `supabaseClient.rpc('recharge_credits_v2', { ... })`
  - **返回格式**: `{ success, balanceAfter, amountAdded }`
  - **状态**: ✅ 已实现

### 积分添加函数 (来自 use-simple-credits.ts)
- [x] `add_credits(user_id, amount)`
  - **前端调用**: `supabaseClient.rpc('add_credits', { user_id, amount })`
  - **返回格式**: `BOOLEAN`
  - **状态**: ✅ 已实现

### 日志记录函数 (来自 use-simple-credits.ts)
- [x] `log_face_swap(user_id, status, error_msg)`
  - **前端调用**: `supabaseClient.rpc('log_face_swap', { user_id, status, error_msg })`
  - **返回格式**: `VOID`
  - **状态**: ✅ 已实现

### 支付处理函数 (来自 webhooks/stripe/route.ts)
- [x] `handle_payment_success(p_payment_intent_id, p_recharge_id)`
  - **前端调用**: 通过 webhook 调用
  - **返回格式**: `{ success, duplicate, balanceAfter }`
  - **状态**: ✅ 已实现

### 奖励积分函数 (来自 credit-service.ts)
- [x] `add_bonus_credits_v2(p_user_id, bonus_amount, bonus_reason, bonus_metadata)`
  - **前端调用**: 通过 API 调用
  - **返回格式**: `{ success, balanceAfter, transactionId }`
  - **状态**: ✅ 已实现

### 余额重计算函数 (来自 webhooks/stripe/route.ts)
- [x] `recalculate_user_balance(p_user_id)`
  - **前端调用**: 通过 webhook 调用
  - **返回格式**: `{ success, totalBalance, ... }`
  - **状态**: ✅ 已实现

### 实时余额函数 (来自 credit-service.ts)
- [x] `get_user_balance_realtime(p_user_id)`
  - **前端调用**: 通过 service 调用
  - **返回格式**: `INTEGER`
  - **状态**: ✅ 已实现 (在主脚本中)

### 原子化消费函数 (来自 credit-service.ts)
- [x] `consume_credits_atomic(p_user_id, p_amount, p_description)`
  - **前端调用**: 通过 service 调用
  - **返回格式**: `{ success, balanceAfter, ... }`
  - **状态**: ✅ 已实现 (在主脚本中)

## ✅ API 路由数据库使用验证

### /api/credits/* 路由
- [x] `/api/credits/balance` - 使用 `getUserCreditBalance` service
- [x] `/api/credits/consume` - 使用 `consume_credits_atomic` 函数
- [x] `/api/credits/transactions` - 查询 `credit_transaction` 表
- [x] `/api/credits/bonus` - 使用 `add_bonus_credits_v2` 函数

### /api/user/* 路由  
- [x] `/api/user/subscription-status` - 查询 `subscription_status_monitor` 表

### /api/payments/* 路由
- [x] `/api/payments/subscriptions` - 查询 `subscription_status_monitor` 表

### /api/webhooks/* 路由
- [x] `/api/webhooks/stripe` - 使用多个函数和表操作

## ✅ Hooks 数据库使用验证

### useCreditsV2 (use-credits-v2.ts)
- [x] 调用 `get_user_credits_v2` ✅
- [x] 调用 `consume_credits_v2` ✅  
- [x] 调用 `recharge_credits_v2` ✅
- [x] 查询 `credit_transaction` 表 ✅

### useSimpleCredits (use-simple-credits.ts)
- [x] 调用 `get_credits` ✅
- [x] 调用 `use_credits` ✅
- [x] 调用 `add_credits` ✅
- [x] 调用 `log_face_swap` ✅

### useCredits (useCredits.ts)  
- [x] 调用 `get_user_credits_v2` ✅
- [x] 调用 API 路由间接使用函数 ✅

### useSubscription (use-subscription.ts)
- [x] 通过 API 查询 `subscription_status_monitor` ✅

### useSubscriptionStatus (use-subscription-status.ts)
- [x] 通过 API 查询 `subscription_status_monitor` ✅

### useCreditTransactions (use-credit-transactions.ts)
- [x] 直接查询 `credit_transaction` 表 ✅
- [x] 支持实时订阅 ✅

## ✅ 视图和权限验证

### 重要视图
- [x] `active_subscriptions_view` - 有效订阅视图 ✅
- [x] `user_credits_summary` - 用户积分汇总视图 ✅

### RLS 策略
- [x] 所有用户数据表都启用了 RLS ✅
- [x] 用户只能访问自己的数据 ✅
- [x] 服务角色拥有完全权限 ✅

### 函数权限
- [x] 认证用户可以调用查询和操作函数 ✅
- [x] 服务角色可以调用所有函数 ✅

## 🔧 执行验证脚本

在数据库中执行以下查询来验证所有组件都已正确创建：

```sql
-- 验证所有表都存在
SELECT tablename FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN (
    'user_profiles', 'user_credit_balance', 'credit_transaction',
    'subscription_credits', 'subscription_status_monitor', 
    'face_swap_histories', 'webhook_failures', 'webhook_errors'
)
ORDER BY tablename;

-- 验证所有函数都存在
SELECT proname FROM pg_proc 
WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND proname IN (
    'get_user_credits_v2', 'get_credits', 'consume_credits_v2', 
    'recharge_credits_v2', 'use_credits', 'add_credits',
    'handle_payment_success', 'log_face_swap', 'add_bonus_credits_v2',
    'recalculate_user_balance', 'get_user_balance_realtime', 
    'consume_credits_atomic', 'add_credits_and_log_transaction'
)
ORDER BY proname;

-- 验证所有视图都存在
SELECT viewname FROM pg_views 
WHERE schemaname = 'public'
AND viewname IN ('active_subscriptions_view', 'user_credits_summary')
ORDER BY viewname;

-- 验证RLS策略
SELECT tablename, policyname 
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

## 📋 总结

### ✅ 完全匹配的组件
1. **所有数据库表** - 结构和字段完全匹配
2. **所有数据库函数** - 参数和返回值格式匹配  
3. **所有API路由** - 数据库操作正确
4. **所有Hooks** - 函数调用正确
5. **所有权限设置** - RLS策略完整

### 🎯 使用建议
1. **先执行主脚本**: `database_complete_setup.sql`
2. **再执行补充脚本**: `database_missing_functions.sql`  
3. **运行验证查询**: 确保所有组件都已创建
4. **测试前端功能**: 验证积分系统、订阅系统等功能正常

前端代码现在应该能够完美地与数据库配合工作，所有功能都应该正常运行！