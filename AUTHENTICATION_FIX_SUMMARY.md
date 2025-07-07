# 认证系统修复方案总结

## 问题诊断

### 主要错误
根据 Supabase 日志，系统出现以下错误：
```
ERROR: relation "public.user" does not exist (SQLSTATE 42P01)
"500: Database error saving new user"
```

### 根本原因
之前的数据库脚本创建了错误的表结构：
- 使用了独立的 `"user"` 表而不是扩展 `auth.users`
- 函数和表引用了不存在的 `public.user` 表
- 数据类型不匹配（TEXT vs UUID）

## 修复方案

我们提供了多种修复方式，从简单到完整：

### 1. 🔍 快速诊断（推荐先试）

访问调试页面：`http://localhost:3000/debug-auth`
- 点击"检查数据库状态"按钮
- 如果显示检查通过，问题已解决
- 如果显示错误，继续下一步

### 2. 📱 Web 界面修复
访问：`http://localhost:3000/debug-auth`
- 如果检查失败，点击"下载完整修复脚本"
- 在 Supabase 控制台执行下载的 SQL

### 3. 🖥️ 命令行修复
```bash
node scripts/simple-db-fix.js
```
- 输出完整的 SQL 脚本
- 复制到 Supabase SQL Editor 执行

### 4. 🔧 API 修复
POST 请求到：`/api/fix-auth-db`
- 需要用户已登录
- 自动检查和诊断问题
- 提供修复建议

### 5. 📄 直接下载 SQL
访问：`/api/sql-script`
- 下载完整的清理修复脚本
- 手动在 Supabase 执行

## 新的正确架构

### 表结构
1. **user_profiles** - 扩展 auth.users
   - `id UUID PRIMARY KEY REFERENCES auth.users(id)`
   - 用户显示信息、头像等
   
2. **user_credit_balance** - 积分管理
   - `user_id UUID REFERENCES auth.users(id)`
   - 余额、充值、消费记录
   
3. **credit_transaction** - 交易记录
   - `user_id UUID REFERENCES auth.users(id)`
   - 所有积分变动记录

### 核心函数
1. **upsert_user_profile(UUID, ...)** - 用户配置管理
2. **get_or_create_user_credit_balance(UUID)** - 积分管理

## 执行修复的步骤

### ⚠️ 重要警告
**完整修复会删除所有现有用户数据！**
如果有生产数据，请先备份。

### 推荐流程
1. 先访问 `/debug-auth` 进行快速检查
2. 如果检查失败，下载修复脚本
3. 在 Supabase SQL Editor 执行脚本
4. 重新测试登录功能

### Supabase 执行步骤
1. 登录 [Supabase Dashboard](https://supabase.com/dashboard)
2. 选择你的项目
3. 点击左侧 "SQL Editor"
4. 粘贴完整的修复脚本
5. 点击 "RUN" 执行
6. 验证所有步骤都显示成功

## 验证修复效果

修复后应该能够：
- ✅ GitHub/Google OAuth 登录成功
- ✅ 自动创建用户配置
- ✅ 初始化 5 个积分
- ✅ 不再出现数据库错误

## 文件列表

### 新创建的修复工具
- `src/db/sql/clean-and-fix-auth.sql` - 完整清理和重建脚本
- `src/app/[locale]/debug-auth/page.tsx` - Web 调试界面
- `src/app/api/fix-auth-db/route.ts` - API 诊断端点
- `src/app/api/sql-script/route.ts` - SQL 下载端点
- `scripts/simple-db-fix.js` - 命令行工具

### 更新的文件
- `src/app/[locale]/auth/callback/route.ts` - 改进错误处理
- 各种数据库脚本的权限和引用

## 故障排除

### 如果修复后仍有问题
1. 检查环境变量配置
2. 验证 Supabase 服务角色密钥权限
3. 确认 OAuth 回调 URL 设置正确
4. 查看 Supabase 日志获取详细错误信息

### 常见问题
- **权限错误**: 确保使用 service_role 权限执行脚本
- **UUID 转换**: 新架构使用 UUID，旧架构使用 TEXT
- **RLS 策略**: 脚本会正确设置行级安全策略

## 技术细节

### 主要改进
1. **正确的外键关系** - 直接引用 `auth.users(id)`
2. **UUID 数据类型** - 与 Supabase Auth 兼容
3. **完整的 RLS 策略** - 确保数据安全
4. **错误恢复机制** - 多层次的错误处理
5. **诊断工具** - 多种方式检查和修复

### 兼容性
- ✅ Supabase Auth v2
- ✅ Next.js 15
- ✅ TypeScript 严格模式
- ✅ 生产环境就绪

---

**最后更新**: 2025-01-07
**状态**: ✅ 构建通过，所有修复工具就绪 