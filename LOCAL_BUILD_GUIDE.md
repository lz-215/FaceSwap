# AIFaceSwap 本地构建指南

## 🚀 快速开始

### 环境要求
- **Node.js**: 18+ (推荐 18.17+)
- **包管理器**: Bun (推荐) 或 npm
- **数据库**: PostgreSQL (通过 Supabase)

### 第一步：安装依赖

```bash
# 推荐使用 Bun (更快)
bun install

# 或使用 npm
npm install
```

### 第二步：环境变量配置

创建 `.env.local` 文件并配置以下环境变量：

```env
# =============================================================================
# 🔵 Supabase 配置 (必需)
# =============================================================================
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# =============================================================================
# 🗄️ 数据库配置 (必需)
# =============================================================================
DATABASE_URL=postgresql://username:password@db.xxx.supabase.co:5432/postgres

# =============================================================================
# 🤖 AI服务 API 配置 (必需 - AI核心服务)
# =============================================================================
FACEPP_API_KEY=your_facepp_api_key
FACEPP_API_SECRET=your_facepp_api_secret
FACEPP_MERGEFACE_URL=https://api-cn.faceplusplus.com/imagepp/v1/mergeface

# =============================================================================
# 💳 Stripe 支付配置 (可选)
# =============================================================================
STRIPE_SECRET_KEY=REMOVED
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PREMIUM_PRICE_ID=price_xxx
STRIPE_PRO_PRICE_ID=price_xxx

# =============================================================================
# 🌐 应用配置
# =============================================================================
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development

# =============================================================================
# 🔐 社交登录 (可选)
# =============================================================================
NEXT_PUBLIC_SUPABASE_GITHUB_ENABLED=true
NEXT_PUBLIC_SUPABASE_GOOGLE_ENABLED=true
```

### 第三步：获取配置信息

#### 🔵 Supabase 配置
1. 访问 [Supabase Dashboard](https://supabase.com/dashboard)
2. 创建新项目或选择现有项目
3. 进入 **Settings** → **API**
4. 复制以下信息：
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` → `SUPABASE_SERVICE_ROLE_KEY`
5. 进入 **Settings** → **Database**
6. 复制 `Connection string` → `DATABASE_URL`

#### 🤖 AI服务 API 配置
1. 请联系项目维护者获取AI服务的API配置信息
2. 将获取到的 `API Key` 和 `API Secret` 填入环境变量

#### 💳 Stripe 配置 (可选)
1. 访问 [Stripe Dashboard](https://dashboard.stripe.com/)
2. 创建账户并获取测试密钥
3. 创建产品和价格，获取 Price ID

### 第四步：数据库设置

```bash
# 推送数据库架构
bun db:push

# 或使用 npm
npm run db:push
```

### 第五步：启动开发服务器

```bash
# 使用 Bun (推荐，包含 Turbopack)
bun dev

# 或使用 npm
npm run dev
```

应用将在 [http://localhost:3000](http://localhost:3000) 启动

## 🛠️ 可用脚本

```bash
# 开发服务器 (Turbopack)
bun dev

# 生产构建
bun run build

# 数据库操作
bun db:push          # 推送架构到数据库
bun db:studio        # 打开数据库管理界面

# 代码检查和格式化
bun check            # 运行所有检查
bun run tests        # 运行测试

# UI 组件管理
bun ui <component>   # 添加 shadcn/ui 组件
```

## 🔧 常见问题解决

### 问题 1：数据库连接失败
```bash
# 检查环境变量
bun run api/db-test

# 确保 DATABASE_URL 格式正确
# postgresql://user:pass@host:port/database
```

### 问题 2：AI服务 API 错误
```bash
# 测试 API 连接
curl -X POST "https://api-cn.faceplusplus.com/imagepp/v1/mergeface" \
  -F "api_key=YOUR_API_KEY" \
  -F "api_secret=YOUR_API_SECRET"
```

### 问题 3：环境变量检查
访问 `http://localhost:3000/api/env-check` 查看配置状态

## 📁 项目结构

```
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── [locale]/          # 国际化路由
│   │   │   ├── face-swap/     # 人脸交换页面
│   │   │   ├── auth/          # 认证页面
│   │   │   └── dashboard/     # 用户面板
│   │   └── api/               # API 路由
│   │       ├── face-swap/     # 人脸交换 API
│   │       ├── stripe/        # 支付 API
│   │       └── env-check/     # 环境检查
│   ├── components/            # React 组件
│   ├── lib/                   # 工具库
│   │   ├── supabase/         # Supabase 客户端
│   │   └── stripe.ts         # Stripe 配置
│   └── db/                    # 数据库配置
├── messages/                  # 国际化文件
├── public/                    # 静态资源
└── 配置文件...
```

## 🚀 部署准备

### 生产构建
```bash
bun run build
```

### 环境变量检查
确保所有生产环境变量已正确配置：
- 将 `NODE_ENV` 设置为 `production`
- 使用生产环境的 Stripe 密钥
- 更新 `NEXT_PUBLIC_APP_URL` 为实际域名

## 📞 获取帮助

- 查看 [项目文档](./README.md)
- 检查 [实施状态](./IMPLEMENTATION_STATUS.md)
- 访问 `/api/env-check` 进行环境诊断 