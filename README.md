# AIFaceSwap - AI人脸交换应用

![AIFaceSwap](https://zvcxdyuidlhzvmhsviwc.supabase.co/storage/v1/object/public/images/faceswap-demo.png)

## 项目概述

AIFaceSwap是一个专业的AI人脸交换应用，使用先进的人工智能技术实现高质量的人脸交换效果。用户可以轻松上传照片，将不同人物的面部特征进行交换，创造有趣的视觉效果。

## ✨ 特性

- **AI人脸交换**：使用先进AI算法实现高质量的人脸交换
- **实时预览**：上传即可预览效果，支持拖拽分割对比
- **安全可靠**：图片仅临时处理，不会永久存储
- **国际化支持**：支持中文和英文界面
- **响应式设计**：完美适配桌面和移动设备
- **用户系统**：支持GitHub和Google第三方登录
- **积分系统**：基于积分的公平使用机制

## 🏗 技术栈

- **前端框架**：Next.js 15 (App Router)
- **UI组件**：Tailwind CSS + Shadcn/ui
- **语言**：TypeScript
- **认证系统**：Supabase Auth
- **数据库**：Supabase PostgreSQL
- **文件存储**：Supabase Storage
- **AI服务**：先进的人脸交换API
- **部署平台**：Vercel
- **国际化**：next-intl

## 主要功能

- **AI人脸交换**：使用先进AI算法实现高质量的人脸交换
- **实时预览**：支持拖拽分割线对比交换前后效果
- **多种模板**：提供丰富的模板库供用户选择
- **安全验证**：完整的文件验证机制，确保上传安全
- **用户认证**：基于Supabase的安全用户认证系统
- **积分系统**：基于积分的使用计费，支持充值和消费记录
- **支付集成**：集成Stripe支付系统，支持多种支付方式
- **国际化支持**：支持英文和中文界面切换

## 核心特性

### 🎯 **智能人脸检测**
- 自动检测图片中的人脸区域
- 支持多种图片格式（JPEG、PNG、WebP）
- 智能文件验证和安全检查

### ⚡ **高性能处理**
- 基于先进AI API的专业人脸交换算法
- 支持高分辨率图片处理
- 优化的图片压缩和传输

### 🔒 **安全可靠**
- 完整的用户认证和授权机制
- 安全的文件上传和存储
- 数据库事务保护积分系统

### 💎 **用户体验**
- 直观的三步操作流程
- 实时的处理状态反馈
- 优雅的错误处理和提示

## 技术栈

### 前端技术
- **框架**：Next.js 15.3.2 (App Router)
- **UI库**：React 19.1.0
- **样式**：Tailwind CSS 4.1.5
- **组件库**：Radix UI, shadcn/ui
- **状态管理**：React Hooks + Context
- **国际化**：next-intl 4.1.0
- **动画**：framer-motion, animejs
- **图标**：lucide-react

### 后端技术
- **认证**：Supabase Auth
- **数据库**：Supabase (PostgreSQL)
- **存储**：Supabase Storage
- **AI服务**：先进的人脸交换API
- **支付**：Stripe
- **表单处理**：@tanstack/react-form

### 开发工具
- **语言**：TypeScript
- **代码检查**：ESLint + Biome
- **包管理**：Bun (推荐) 或 npm
- **构建工具**：Next.js + Turbopack

## 快速开始

### 环境要求

- Node.js 18+
- Bun (推荐) 或 npm
- PostgreSQL 数据库 (通过Supabase)

### 安装步骤

1. **克隆仓库**
```bash
git clone https://github.com/your-username/ai-face-swap.git
cd ai-face-swap
```

2. **安装依赖**
```bash
bun install
# 或
npm install
```

3. **环境配置**

创建`.env.local`文件并配置以下环境变量：

```env
# Supabase 配置
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# 数据库
DATABASE_URL=your_database_url

# AI服务 API 配置 (必需)
FACEPP_API_KEY=your_facepp_api_key
FACEPP_API_SECRET=your_facepp_api_secret
FACEPP_MERGEFACE_URL=https://api-cn.faceplusplus.com/imagepp/v1/mergeface

# Stripe 支付配置
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret
STRIPE_PREMIUM_PRICE_ID=your_premium_price_id
STRIPE_PRO_PRICE_ID=your_pro_price_id

# 应用配置
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

4. **数据库设置**
```bash
# 推送数据库架构
bun db:push

# 运行积分系统函数
psql $DATABASE_URL -f src/db/sql/credit-functions.sql
```

5. **启动开发服务器**
```bash
bun dev
# 或
npm run dev
```

6. **访问应用**

打开浏览器访问 [http://localhost:3000](http://localhost:3000)

## 项目结构

```
├── messages/               # 国际化消息文件
│   ├── en.json            # 英文翻译
│   └── zh.json            # 中文翻译
├── public/                # 静态资源
│   ├── images/            # 图片资源
│   └── templates/         # 模板图片
├── src/
│   ├── app/               # Next.js App Router
│   │   ├── [locale]/      # 国际化路由
│   │   │   ├── face-swap/ # 人脸交换页面
│   │   │   ├── auth/      # 认证页面
│   │   │   ├── pricing/   # 价格页面
│   │   │   └── dashboard/ # 用户面板
│   │   └── api/           # API路由
│   │       ├── face-swap/ # 人脸交换API
│   │       ├── credits/   # 积分系统API
│   │       └── stripe/    # 支付API
│   ├── db/                # 数据库配置
│   │   ├── schema/        # 数据库表结构
│   │   └── sql/           # SQL函数和脚本
│   ├── hooks/             # 自定义React Hooks
│   │   ├── use-auth.ts    # 认证Hook
│   │   ├── use-credits.ts # 积分系统Hook
│   │   └── use-loading.ts # 加载状态Hook
│   ├── lib/               # 工具库
│   │   ├── supabase/      # Supabase客户端
│   │   ├── file-validation.ts # 文件验证
│   │   └── stripe.ts      # Stripe配置
│   └── ui/                # UI组件
│       ├── components/    # 业务组件
│       └── primitives/    # 基础UI组件
└── ...配置文件
```

## 核心功能详解

### 🔄 **人脸交换流程**

1. **上传原图**：选择要替换人脸的目标图片
2. **上传人脸**：选择提供人脸特征的源图片
3. **AI处理**：系统自动进行人脸检测和交换
4. **结果预览**：支持拖拽对比查看效果
5. **下载保存**：下载高质量的交换结果

### 💰 **积分系统**

- **新用户奖励**：注册即获得5个免费积分
- **按次计费**：每次人脸交换消费1个积分
- **充值支持**：支持多种积分套餐购买
- **交易记录**：完整的积分使用和充值记录

### 🔐 **安全特性**

- **文件验证**：多层次的文件安全检查
- **用户认证**：基于JWT的安全认证机制
- **数据保护**：所有敏感数据加密存储
- **API安全**：完整的请求验证和频率限制

## 部署指南

### Vercel 部署 (推荐)

1. **连接GitHub仓库**到Vercel
2. **配置环境变量**（参考上述环境配置）
3. **设置构建命令**：`bun run build`
4. **部署完成**后配置自定义域名

### 其他平台

项目兼容所有支持Next.js的部署平台：
- Netlify
- Railway
- AWS Amplify
- Digital Ocean App Platform

## 开发指南

### 添加新功能

1. 创建相应的React组件
2. 添加必要的API路由
3. 更新数据库schema（如需要）
4. 添加国际化翻译
5. 编写测试用例

### 代码规范

- 使用TypeScript进行类型安全开发
- 遵循ESLint和Biome的代码规范
- 组件采用函数式编程风格
- 使用descriptive命名约定

## API文档

### 人脸交换API

```typescript
POST /api/face-swap
Content-Type: multipart/form-data

// 请求参数
{
  origin: File,  // 目标图片
  face: File     // 源人脸图片
}

// 响应
{
  success: boolean,
  result?: string,  // base64编码的结果图片
  error?: string
}
```

### 积分API

```typescript
// 获取用户积分
GET /api/credits/balance

// 消费积分
POST /api/credits/consume
{
  amount: number,
  description?: string
}
```

## 贡献指南

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

## 常见问题

### Q: 如何配置AI服务API密钥？
A: 请联系项目维护者获取AI服务的API密钥配置信息，或参考项目文档中的环境变量配置部分。

### Q: 支持哪些图片格式？
A: 支持JPEG、PNG、WebP格式，文件大小限制10MB，建议尺寸256x256到2048x2048像素。

### Q: 如何升级积分套餐？
A: 登录后访问pricing页面选择合适的套餐进行购买。

## 许可证

本项目基于 [MIT License](LICENSE) 开源协议。

## 联系我们

- 项目地址：[GitHub Repository](https://github.com/your-username/ai-face-swap)
- 问题反馈：[Issues](https://github.com/your-username/ai-face-swap/issues)
- 邮箱：support@aifaceswap.com

---

**注意**：本应用仅供娱乐和学习用途，请遵守相关法律法规，不得用于非法用途。
