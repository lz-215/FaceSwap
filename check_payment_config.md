# 🔍 支付配置检查指南

## 📋 问题诊断清单

### 1️⃣ 数据库修复（最重要）

**立即执行数据库修复脚本：**
1. 登录 [Supabase Dashboard](https://app.supabase.com)
2. 选择你的项目
3. 进入 "SQL Editor"  
4. 复制并执行 `emergency_fix_payment_credits.sql` 脚本

### 2️⃣ Vercel 环境变量检查

**必需的环境变量：**
```bash
STRIPE_SECRET_KEY=sk_live_xxx (或 REMOVED)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_xxx (或 pk_test_xxx)  
STRIPE_WEBHOOK_SECRET=whsec_xxx
```

**检查步骤：**
1. 登录 [Vercel Dashboard](https://vercel.com)
2. 选择 `face-swap-build` 项目
3. Settings → Environment Variables
4. 确认以上3个变量都已配置
5. 确认所有变量都设置为 **Production**, **Preview**, **Development**

### 3️⃣ Stripe Webhook 配置

**当前Webhook URL应该是：**
```
https://www.kxtlg.com/api/webhooks/stripe
```

**检查步骤：**
1. 登录 [Stripe Dashboard](https://dashboard.stripe.com)
2. Developers → Webhooks
3. 找到你的webhook endpoint
4. 确认URL是 `/api/webhooks/stripe` （不是 `/api/stripe/webhook`）
5. 确认监听以下事件：
   - ✅ `payment_intent.succeeded`
   - ✅ `customer.subscription.created`
   - ✅ `customer.subscription.updated`
   - ✅ `customer.subscription.deleted`

### 4️⃣ 快速验证命令

**检查应用健康状况：**
```bash
curl https://www.kxtlg.com/api/stripe/health
```

**检查最近的webhook事件：**
```bash
curl https://www.kxtlg.com/api/debug/webhook
```

## 🛠️ 修复步骤（按顺序）

### 步骤1: 执行数据库修复
```sql
-- 在 Supabase SQL Editor 中执行
\i emergency_fix_payment_credits.sql
```

### 步骤2: 检查并修复 Webhook URL
如果 Stripe 中的 webhook URL 是错误的：
1. 在 Stripe Dashboard 中编辑 webhook
2. 将URL改为：`https://www.kxtlg.com/api/webhooks/stripe`
3. 保存配置

### 步骤3: 重新部署应用
```bash
# 如果修改了环境变量
vercel --prod

# 或者在 Vercel Dashboard 中点击 "Redeploy"
```

### 步骤4: 测试支付流程
1. 创建一个测试支付（使用测试卡号 `4242 4242 4242 4242`）
2. 检查 Vercel Functions 日志
3. 确认数据库中有对应的充值和交易记录

## 🚨 常见错误和解决方法

### 错误1: Webhook 返回 405
**原因**: Webhook URL 配置错误
**解决**: 将 Stripe webhook URL 改为 `/api/webhooks/stripe`

### 错误2: Webhook 返回 400 (签名验证失败)
**原因**: `STRIPE_WEBHOOK_SECRET` 错误或缺失
**解决**: 
1. 从 Stripe webhook 设置中复制正确的 webhook secret
2. 在 Vercel 中更新 `STRIPE_WEBHOOK_SECRET` 环境变量
3. 重新部署

### 错误3: Webhook 返回 500 (RLS 权限错误)
**原因**: 数据库 RLS 策略阻止 webhook 写入
**解决**: 执行 `emergency_fix_payment_credits.sql` 修复脚本

### 错误4: 支付成功但无积分记录
**原因**: RPC 函数缺失或充值记录孤立
**解决**: 
1. 执行数据库修复脚本
2. 调用修复API: `POST /api/admin/fix-credits`

## 📊 验证修复结果

### 检查数据库修复状态
```sql
-- 检查 RPC 函数是否存在
SELECT COUNT(*) FROM information_schema.routines 
WHERE routine_name = 'handle_stripe_webhook_payment_success';

-- 检查 RLS 策略
SELECT COUNT(*) FROM pg_policies 
WHERE tablename IN ('credit_recharge', 'credit_transaction', 'user_credit_balance')
AND policyname LIKE '%service_role%';

-- 检查孤立的充值记录
SELECT COUNT(*) FROM credit_recharge cr
LEFT JOIN credit_transaction ct ON cr.id = ct.related_recharge_id
WHERE cr.status = 'completed' AND ct.id IS NULL;
```

### 检查应用配置
访问：`https://www.kxtlg.com/api/stripe/health`

期望结果：
```json
{
  "success": true,
  "status": "healthy",
  "config": {
    "stripe": {
      "connected": true,
      "mode": "live"
    },
    "completeness": "100%"
  }
}
```

## 🎯 测试支付流程

### 测试环境
使用 Stripe 测试卡号：
- `4242 4242 4242 4242` (Visa)
- 任意有效的过期日期和CVC

### 生产环境
使用真实银行卡进行小额测试

### 验证步骤
1. **创建支付** → 检查充值记录是否创建
2. **完成支付** → 检查 webhook 是否被触发
3. **查看结果** → 确认积分是否正确增加

## 📞 如果问题仍然存在

**收集以下信息：**
1. Vercel Functions 日志 (最近的 webhook 调用)
2. Stripe Dashboard 中的 webhook 事件日志
3. 数据库中最近的充值记录 ID
4. 用户的积分余额截图

**联系技术支持时提供：**
- 用户ID
- 支付金额
- 支付时间
- Payment Intent ID
- 错误日志截图 