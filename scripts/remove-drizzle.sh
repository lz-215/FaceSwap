#!/bin/bash

# 移除Drizzle的脚本
echo "🗑️  开始移除Drizzle ORM..."

# 1. 删除Drizzle相关文件和目录
echo "📁 删除Drizzle目录和配置文件..."
rm -rf drizzle/
rm -f drizzle.config.ts
rm -rf src/db/schema/

# 2. 删除package.json中的Drizzle依赖
echo "📦 从package.json中移除Drizzle依赖..."
# 注意：这需要手动操作，脚本只是提示

echo "请手动从package.json中移除以下依赖:"
echo "  - drizzle-orm"
echo "  - drizzle-kit"
echo "  - @types/pg (如果不需要)"
echo "  - pg (如果不需要)"
echo "  - postgres (如果不需要)"

# 3. 删除Drizzle相关脚本
echo "🔧 请从package.json的scripts中移除:"
echo "  - db:push"
echo "  - db:studio"

# 4. 创建数据库操作的建议
echo ""
echo "✅ Drizzle文件已删除！"
echo ""
echo "📋 后续步骤:"
echo "1. 运行 'bun install' 重新安装依赖"
echo "2. 更新所有导入语句，从 '~/db/schema/*' 改为 '~/lib/database-types'"
echo "3. 使用 '~/src/db/sql/' 目录中的SQL文件管理数据库架构"
echo "4. 继续使用Supabase HTTP API进行所有数据库操作"
echo ""
echo "🎉 现在你的项目完全不依赖Drizzle了！" 