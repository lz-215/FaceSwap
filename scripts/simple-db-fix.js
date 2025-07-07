// 简单的数据库修复脚本
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 手动加载环境变量
const envPath = join(__dirname, '../.env.local');
const envData = readFileSync(envPath, 'utf8');
envData.split('\n').forEach(line => {
  const [key, ...values] = line.split('=');
  const value = values.join('=');
  if (key && value && !key.startsWith('#') && key.trim() && value.trim()) {
    process.env[key.trim()] = value.trim();
  }
});

console.log('✅ 环境变量已加载');
console.log('');
console.log('🚨 重要提示：这是一个完整的数据库清理和重建脚本！');
console.log('它将删除所有现有的用户数据和相关表，然后重新创建正确的结构。');
console.log('如果你有重要数据，请先备份！');
console.log('');
console.log('📄 请手动在 Supabase 数据库控制台执行以下 SQL 脚本:');
console.log('=' .repeat(60));

// 读取并输出新的清理脚本
const sqlPath = join(__dirname, '../src/db/sql/clean-and-fix-auth.sql');
const sqlContent = readFileSync(sqlPath, 'utf8');
console.log(sqlContent);

console.log('=' .repeat(60));
console.log('');
console.log('执行步骤:');
console.log('1. 登录到 Supabase 控制台');
console.log('2. 进入你的项目');
console.log('3. 点击左侧 "SQL Editor"');
console.log('4. 复制上面的 SQL 脚本并粘贴到编辑器中');
console.log('5. 点击 "RUN" 按钮执行');
console.log('');
console.log('⚠️  注意：这个脚本会删除旧的表结构并重建，所有现有数据将丢失！');
console.log('');
console.log('执行完成后，登录功能应该就能正常工作了。'); 