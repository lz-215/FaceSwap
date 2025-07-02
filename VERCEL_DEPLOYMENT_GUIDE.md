# 🚀 Vercel 部署配置指南

## 📋 部署前检查清单

在部署到 Vercel 之前，请确保完成以下配置：

### 1. 🌐 Vercel 环境变量配置

在 Vercel Dashboard → Settings → Environment Variables 中添加以下环境变量：

```bash
# ✅ 应用基础配置 (必需)
NEXT_PUBLIC_APP_URL=https://your-domain.vercel.app
NODE_ENV=production

# ✅ Supabase 配置 (必需)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# ✅ 数据库配置 (必需)
DATABASE_URL=postgresql://username:password@db.xxx.supabase.co:5432/postgres

# ✅ AI 服务配置 (必需)
FACEPP_API_KEY=your_facepp_api_key
FACEPP_API_SECRET=your_facepp_api_secret
FACEPP_MERGEFACE_URL=https://api-cn.faceplusplus.com/imagepp/v1/mergeface

# ✅ 社交登录开关 (必需)
NEXT_PUBLIC_SUPABASE_GITHUB_ENABLED=true
NEXT_PUBLIC_SUPABASE_GOOGLE_ENABLED=true

# ✅ Stripe 支付配置 (可选)
STRIPE_SECRET_KEY=sk_live_xxx  # 生产环境使用 live 密钥
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PREMIUM_PRICE_ID=price_xxx
STRIPE_PRO_PRICE_ID=price_xxx
```

### 2. 🔐 GitHub OAuth App 配置

#### 步骤 1：访问 GitHub Developer Settings
1. 登录 GitHub
2. 进入 Settings → Developer settings → OAuth Apps
3. 找到您的 OAuth App 或创建新的

#### 步骤 2：更新回调 URL
在 OAuth App 设置中，确保 **Authorization callback URL** 包含以下地址：

```
# 本地开发
http://localhost:3000/auth/callback

# 生产环境 (替换为您的实际域名)
https://your-domain.vercel.app/auth/callback
```

💡 **提示**：可以同时配置多个回调URL，用换行分隔。

### 3. 🗄️ Supabase 配置

#### 步骤 1：配置重定向 URL
在 Supabase Dashboard → Authentication → URL Configuration 中添加：

```
# 本地开发
http://localhost:3000/**

# 生产环境 (替换为您的实际域名)
https://your-domain.vercel.app/**
```

#### 步骤 2：启用 GitHub Provider
1. 进入 Authentication → Providers
2. 启用 GitHub provider
3. 填入 GitHub OAuth App 的 Client ID 和 Client Secret

### 4. 🔧 代码修复说明

我们已经修复了以下文件中的重定向URL问题：

```typescript
// ✅ 已修复：统一使用环境变量优先的重定向URL构建
src/lib/supabase-auth-client.ts
src/components/login-form.tsx
src/components/forgot-password-form.tsx
src/components/payment/payment-form.tsx
```

修复逻辑：
```typescript
const getRedirectUrl = (path: string) => {
  // 优先使用环境变量，如果没有设置则回退到当前origin
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
    (typeof window !== 'undefined' ? window.location.origin : '');
  return `${baseUrl}${path}`;
};
```

### 5. 🚀 部署步骤

#### 方法一：通过 Git 自动部署
1. 将代码推送到 GitHub 仓库
2. 在 Vercel 中连接 GitHub 仓库
3. 配置环境变量
4. 触发部署

#### 方法二：通过 Vercel CLI
```bash
# 安装 Vercel CLI
npm i -g vercel

# 登录
vercel login

# 部署
vercel --prod
```

### 6. 🧪 部署后测试

#### 测试清单：
- [ ] 访问首页正常加载
- [ ] 点击 GitHub 登录按钮
- [ ] 确认重定向到 GitHub 授权页面
- [ ] 授权后正确返回到应用
- [ ] 用户登录状态正常
- [ ] 访问 `/api/env-check` 检查环境变量

#### 测试 URL：
```bash
# 环境变量检查
https://your-domain.vercel.app/api/env-check

# 登录测试
https://your-domain.vercel.app/auth/sign-in
```

### 7. 🐛 常见问题排查

#### 问题 1：仍然重定向到 localhost
**原因**：`NEXT_PUBLIC_APP_URL` 环境变量未设置或设置错误
**解决**：在 Vercel 环境变量中正确设置生产域名

#### 问题 2：GitHub 授权后显示错误
**原因**：GitHub OAuth App 回调URL未包含生产域名
**解决**：在 GitHub OAuth App 设置中添加生产环境回调URL

#### 问题 3：Supabase 认证失败
**原因**：Supabase 重定向URL配置不正确
**解决**：在 Supabase Dashboard 中添加生产域名到重定向URL列表

#### 问题 4：环境变量未生效
**原因**：部署时环境变量未正确加载
**解决**：
1. 检查环境变量名称拼写
2. 重新部署项目
3. 使用 `/api/env-check` 验证

### 8. 📱 生产环境优化建议

#### 安全配置：
```bash
# 生产环境应使用 HTTPS
NEXT_PUBLIC_APP_URL=https://your-domain.vercel.app

# 使用生产环境的 Stripe 密钥
STRIPE_SECRET_KEY=sk_live_xxx  # 而不是 REMOVED
```

#### 性能优化：
- 启用 Vercel Analytics
- 配置 CDN 缓存策略
- 启用 Edge Functions (如果需要)

### 9. 🔍 调试工具

```bash
# 检查环境变量
curl https://your-domain.vercel.app/api/env-check

# 查看 Vercel 部署日志
vercel logs

# 检查 Supabase 认证状态
# 在浏览器控制台运行：
localStorage.getItem('supabase.auth.token')
```

### 10. 📞 获取帮助

如果遇到问题：
1. 检查 Vercel 部署日志
2. 查看浏览器开发者工具的 Network 和 Console 标签
3. 验证所有环境变量是否正确设置
4. 确认 OAuth App 和 Supabase 配置正确

---

**🎉 部署成功后，您的应用应该能够正常使用 GitHub 和 Google 登录功能！** 