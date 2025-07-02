# 🔧 Stripe + Vercel 完整配置指南

## 📋 必需的环境变量清单

### 在Vercel中需要配置以下环境变量：

| 环境变量 | 类型 | 说明 | 示例值 |
|---------|------|------|--------|
| `STRIPE_SECRET_KEY` | 私密 | Stripe密钥 | `sk_live_xxx` 或 `REMOVED` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | 公开 | Stripe公开密钥 | `pk_live_xxx` 或 `pk_test_xxx` |
| `STRIPE_WEBHOOK_SECRET` | 私密 | Webhook签名密钥 | `whsec_xxx` |
| `STRIPE_PREMIUM_PRICE_ID` | 私密 | 高级套餐价格ID | `price_xxx` |
| `STRIPE_PRO_PRICE_ID` | 私密 | 专业套餐价格ID | `price_xxx` |

## 🚀 步骤一：在Vercel中配置环境变量

### 1. 登录Vercel Dashboard
访问 [vercel.com](https://vercel.com) 并登录

### 2. 选择您的项目
找到 `face-swap-build` 项目

### 3. 进入设置页面
项目页面 → Settings → Environment Variables

### 4. 添加环境变量
点击 "Add New" 按钮，逐一添加以下变量：

```bash
# Stripe密钥（从Stripe Dashboard获取）
STRIPE_SECRET_KEY=sk_live_xxx_your_secret_key

# Stripe公开密钥（从Stripe Dashboard获取）
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_xxx_your_publishable_key

# Webhook密钥（稍后从Stripe Webhook配置中获取）
STRIPE_WEBHOOK_SECRET=whsec_xxx_your_webhook_secret

# 产品价格ID（可选，如果有订阅功能）
STRIPE_PREMIUM_PRICE_ID=price_xxx
STRIPE_PRO_PRICE_ID=price_xxx
```

⚠️ **重要提示**：
- 生产环境使用 `sk_live_` 和 `pk_live_` 开头的密钥
- 测试环境使用 `REMOVED` 和 `pk_test_` 开头的密钥
- 所有环境变量都要设置为 **Production**, **Preview**, **Development**

## 🎯 步骤二：配置Stripe Webhook

### 1. 登录Stripe Dashboard
访问 [dashboard.stripe.com](https://dashboard.stripe.com)

### 2. 进入Webhooks设置
左侧菜单 → Developers → Webhooks

### 3. 创建新的Webhook Endpoint
点击 "Add endpoint" 按钮

### 4. 配置Webhook URL
```
Endpoint URL: https://your-vercel-domain.vercel.app/api/webhooks/stripe
```

**获取您的Vercel域名：**
- 方法1: 在Vercel项目页面的 "Domains" 部分查看
- 方法2: 从最近的部署URL中获取，格式如：`https://face-swap-build-xxx-xxx.vercel.app`

### 5. 选择监听的事件
勾选以下事件：
- ✅ `payment_intent.succeeded` (支付成功)
- ✅ `customer.subscription.created` (订阅创建)
- ✅ `customer.subscription.updated` (订阅更新)
- ✅ `customer.subscription.deleted` (订阅取消)

### 6. 保存并获取Webhook Secret
- 点击 "Add endpoint" 保存
- 保存后，点击创建的webhook endpoint
- 在 "Signing secret" 部分点击 "Reveal"
- 复制 `whsec_xxx` 开头的密钥

### 7. 将Webhook Secret添加到Vercel
返回Vercel → Environment Variables → 添加：
```
STRIPE_WEBHOOK_SECRET=whsec_xxx_your_copied_secret
```

## 🔄 步骤三：重新部署应用

配置完环境变量后，需要重新部署：

```bash
# 在项目根目录执行
vercel --prod
```

或者在Vercel Dashboard中点击 "Redeploy" 按钮。

## ✅ 步骤四：验证配置

### 1. 检查环境变量
在Vercel Dashboard中确认所有环境变量都已正确设置。

### 2. 测试Webhook连接
```bash
# 可以使用Stripe CLI测试（可选）
stripe listen --forward-to https://your-domain.vercel.app/api/webhooks/stripe
```

### 3. 检查应用日志
在Vercel Dashboard → Functions → 查看webhook处理日志。

### 4. 进行测试支付
- 创建一个测试支付
- 检查Vercel函数日志是否有webhook处理记录
- 确认数据库中正确创建了充值和交易记录

## 🐛 常见问题排除

### 问题1: Webhook返回401错误
**原因**: `STRIPE_WEBHOOK_SECRET` 配置错误
**解决**: 重新从Stripe复制正确的webhook secret

### 问题2: Webhook返回500错误
**原因**: 数据库RLS权限问题
**解决**: 确保已执行数据库修复脚本

### 问题3: 找不到充值记录
**原因**: 支付metadata中缺少`rechargeId`
**解决**: 检查前端支付创建代码，确保正确设置metadata

### 问题4: 环境变量不生效
**原因**: 部署时环境变量未更新
**解决**: 修改环境变量后重新部署

## 🔍 验证脚本

创建一个简单的验证API来检查配置：

```javascript
// 在 src/app/api/stripe/health/route.ts 中创建
import { NextResponse } from 'next/server';
import { stripe } from '~/lib/stripe';

export async function GET() {
  try {
    // 检查Stripe连接
    const account = await stripe.accounts.retrieve();
    
    // 检查环境变量
    const config = {
      hasSecretKey: !!process.env.STRIPE_SECRET_KEY,
      hasPublishableKey: !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
      hasWebhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET,
      accountName: account.display_name || account.id,
      webhookEndpoint: `${process.env.VERCEL_URL || 'localhost'}/api/webhooks/stripe`
    };
    
    return NextResponse.json({ success: true, config });
  } catch (error) {
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}
```

访问 `https://your-domain.vercel.app/api/stripe/health` 来验证配置。

## 📊 配置检查清单

- [ ] ✅ Vercel环境变量已配置
- [ ] ✅ Stripe webhook已创建
- [ ] ✅ Webhook events已选择
- [ ] ✅ Webhook secret已设置
- [ ] ✅ 应用已重新部署
- [ ] ✅ 数据库RLS策略已应用
- [ ] ✅ 测试支付流程正常

## 🚀 部署后测试

1. **创建测试支付**: 使用Stripe测试卡号 `4242 4242 4242 4242`
2. **检查Webhook日志**: 在Stripe Dashboard → Webhooks中查看请求日志
3. **验证数据库**: 确认充值和交易记录正确创建
4. **检查用户积分**: 确认用户积分余额正确更新

---

**🎉 配置完成后，您的支付系统就可以正常工作了！** 