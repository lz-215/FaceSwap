# 🔍 支付问题深度诊断指南

## 🚨 "修复完成后还是不可用" 问题排查

### 📋 系统性检查清单

#### 1️⃣ **确认 Stripe Webhook URL 是否已修复**

**检查方法：**
1. 登录 [Stripe Dashboard](https://dashboard.stripe.com)
2. 进入 Developers → Webhooks
3. 确认 URL 是：`https://www.kxtlg.com/api/webhooks/stripe`
4. **不应该是：** `https://www.kxtlg.com/api/stripe/webhook`

**如果URL还是错误的：**
- 点击编辑 webhook
- 将URL改为正确地址
- 保存配置

#### 2️⃣ **检查环境变量配置**

**在 Vercel Dashboard 中检查：**
1. 进入项目 Settings → Environment Variables
2. 确认以下变量存在且有值：
   ```
   STRIPE_SECRET_KEY=sk_live_xxx (或 REMOVED)
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_xxx (或 pk_test_xxx)
   STRIPE_WEBHOOK_SECRET=whsec_xxx
   ```
3. 确认所有变量都设置为 **Production**、**Preview**、**Development**

**如果缺少任何变量：**
- 添加缺失的变量
- 重新部署应用

#### 3️⃣ **测试应用健康状况**

**方法1：浏览器访问**
在浏览器中访问：`https://www.kxtlg.com/api/stripe/health`

**期望结果：**
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

**如果返回错误：**
- 500错误 = Stripe密钥配置错误
- 404错误 = 路由不存在，需要重新部署

#### 4️⃣ **测试 Webhook 端点**

**方法1：浏览器访问**
访问：`https://www.kxtlg.com/api/webhooks/stripe`

**期望结果：**
- **应该返回 405 Method Not Allowed**（这是正常的，因为GET请求不被允许）
- **不应该返回 404 Not Found**

**如果返回404：**
- 说明路由不存在
- 需要重新部署应用

#### 5️⃣ **检查数据库RPC函数**

**在 Supabase SQL Editor 中执行：**
```sql
-- 检查RPC函数是否存在
SELECT COUNT(*) as rpc_function_exists
FROM information_schema.routines 
WHERE routine_name = 'handle_stripe_webhook_payment_success';

-- 检查RLS策略
SELECT COUNT(*) as rls_policies_count
FROM pg_policies 
WHERE tablename IN ('credit_recharge', 'credit_transaction', 'user_credit_balance')
  AND policyname LIKE '%service_role%';
```

**期望结果：**
- `rpc_function_exists`: 1
- `rls_policies_count`: 4 或更多

#### 6️⃣ **手动创建测试支付**

**步骤：**
1. 在应用中发起充值
2. 使用测试卡号：`4242 4242 4242 4242`
3. 观察支付流程

**检查数据库记录：**
```sql
-- 查看最近的充值记录
SELECT * FROM credit_recharge 
ORDER BY created_at DESC 
LIMIT 5;

-- 查看最近的交易记录
SELECT * FROM credit_transaction 
ORDER BY created_at DESC 
LIMIT 5;
```

### 🔍 详细错误诊断

#### 错误A：支付创建失败
**症状：** 无法创建支付意图
**原因：** Stripe密钥配置错误
**解决：** 检查 `STRIPE_SECRET_KEY` 环境变量

#### 错误B：支付成功但webhook返回405
**症状：** Stripe显示webhook调用失败，返回405
**原因：** Webhook URL路径错误
**解决：** 将URL从 `/api/stripe/webhook` 改为 `/api/webhooks/stripe`

#### 错误C：支付成功但积分未增加
**症状：** 支付完成，但用户积分余额没有变化
**原因：** Webhook处理失败或RLS权限问题
**解决：** 检查数据库修复是否成功执行

#### 错误D：数据库连接失败
**症状：** 所有API都返回500错误
**原因：** Supabase连接配置错误
**解决：** 检查数据库连接配置

### 🛠️ 具体修复步骤

#### 如果健康检查失败：
1. **重新部署应用**：在Vercel Dashboard点击"Redeploy"
2. **检查环境变量**：确保所有Stripe相关变量都配置正确
3. **验证Stripe密钥**：在Stripe Dashboard确认密钥有效

#### 如果webhook端点404：
1. **确认文件存在**：检查 `src/app/api/webhooks/stripe/route.ts` 文件
2. **重新部署**：确保最新代码已部署
3. **检查路由**：确认Next.js App Router配置正确

#### 如果数据库RPC函数缺失：
1. **重新执行修复脚本**：在Supabase SQL Editor中再次运行 `emergency_fix_payment_credits.sql`
2. **检查权限**：确认你有数据库管理权限
3. **验证表结构**：确认所有必需的表都存在

### 📞 获取帮助信息

#### 收集以下信息用于进一步诊断：

1. **健康检查结果**：访问 `/api/stripe/health` 的完整响应
2. **Webhook测试结果**：访问 `/api/webhooks/stripe` 的响应状态码
3. **环境变量状态**：确认哪些变量已配置（不要提供实际值）
4. **数据库状态**：RPC函数和RLS策略的检查结果
5. **最近的错误日志**：Vercel Functions的错误日志
6. **Stripe事件日志**：Stripe Dashboard中的webhook事件状态

### 🎯 快速验证脚本

**将以下信息填写完整：**

- [ ] Stripe Webhook URL已修复 (正确: `/api/webhooks/stripe`)
- [ ] 环境变量已配置 (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET等)
- [ ] 应用已重新部署
- [ ] 健康检查通过 (`/api/stripe/health` 返回success)
- [ ] Webhook端点正常 (`/api/webhooks/stripe` 返回405而非404)
- [ ] 数据库RPC函数存在
- [ ] RLS策略已应用

**如果以上都✅，但仍有问题：**
请提供具体的错误信息、用户操作步骤和相关日志，以便进一步诊断。 