import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 获取当前文件的目录路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 手动加载 .env.local 文件
const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const envData = fs.readFileSync(envPath, 'utf8');
  envData.split('\n').forEach(line => {
    const [key, ...values] = line.split('=');
    const value = values.join('=');
    if (key && value && !key.startsWith('#') && key.trim() && value.trim()) {
      process.env[key.trim()] = value.trim();
    }
  });
}

// 从环境变量获取 Supabase 配置
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('🔍 环境变量检查:');
console.log('- NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✅ 已设置' : '❌ 未设置');
console.log('- SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✅ 已设置' : '❌ 未设置');

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ 缺少 Supabase 环境变量');
  console.error('请确保 .env.local 中设置了:');
  console.error('- NEXT_PUBLIC_SUPABASE_URL');
  console.error('- SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// 创建 Supabase 客户端（使用 service role key）
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function fixAuthDatabase() {
  try {
    console.log('🔧 开始修复认证数据库...');
    
    // 首先检查是否可以连接到数据库
    console.log('🔗 测试数据库连接...');
    
    // 使用一个更简单的连接测试
    const { data: healthCheck, error: healthError } = await supabase
      .from('auth.users')
      .select('count')
      .single();
    
    if (healthError) {
      console.log('⚠️ auth.users 访问失败，尝试其他方式测试连接...');
      
      // 尝试使用 RPC 调用来测试连接
      const { data: rpcTest, error: rpcError } = await supabase.rpc('version');
      
      if (rpcError) {
        console.error('❌ 数据库连接失败:', rpcError);
        return;
      } else {
        console.log('✅ 数据库连接成功 (通过 RPC)');
      }
    } else {
      console.log('✅ 数据库连接成功');
    }
    
    // 检查 user_profiles 表是否存在
    console.log('📊 检查 user_profiles 表...');
    const { error: profileTableError } = await supabase
      .from('user_profiles')
      .select('id')
      .limit(1);
    
    if (profileTableError && profileTableError.code === '42P01') {
      console.log('📝 user_profiles 表不存在，需要创建...');
      
      // 直接使用 supabase 的表创建方法，而不是 RPC
      console.log('📝 通过直接 SQL 创建 user_profiles 表...');
      
      try {
        // 简化的表创建，不使用 RPC
        await supabase.sql`
          CREATE TABLE IF NOT EXISTS user_profiles (
            id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
            display_name TEXT,
            first_name TEXT,
            last_name TEXT,
            avatar_url TEXT,
            customer_id TEXT UNIQUE,
            subscription_status TEXT,
            project_id TEXT DEFAULT '0616faceswap',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );
        `;
        
        console.log('✅ user_profiles 表创建成功（通过 SQL）');
        
        // 启用 RLS
        await supabase.sql`ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;`;
        console.log('✅ user_profiles RLS 已启用');
        
      } catch (sqlError) {
        console.error('❌ 通过 SQL 创建表失败:', sqlError);
        
        // 如果 SQL 方法也失败，说明可能是权限问题
        console.log('⚠️ 无法创建表，可能需要数据库管理员权限');
        console.log('请手动在 Supabase 控制台执行以下 SQL:');
        console.log(`
          CREATE TABLE IF NOT EXISTS user_profiles (
            id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
            display_name TEXT,
            first_name TEXT,
            last_name TEXT,
            avatar_url TEXT,
            customer_id TEXT UNIQUE,
            subscription_status TEXT,
            project_id TEXT DEFAULT '0616faceswap',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );
          
          ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
        `);
      }
      
    } else if (profileTableError) {
      console.error('❌ 检查 user_profiles 表时出错:', profileTableError);
    } else {
      console.log('✅ user_profiles 表已存在');
    }
    
    // 检查 user_credit_balance 表是否存在
    console.log('💰 检查 user_credit_balance 表...');
    const { error: creditTableError } = await supabase
      .from('user_credit_balance')
      .select('id')
      .limit(1);
    
    if (creditTableError && creditTableError.code === '42P01') {
      console.log('💰 user_credit_balance 表不存在，需要创建...');
      
      try {
        await supabase.sql`
          CREATE TABLE IF NOT EXISTS user_credit_balance (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
            balance INTEGER NOT NULL DEFAULT 0,
            total_recharged INTEGER NOT NULL DEFAULT 0,
            total_consumed INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            CONSTRAINT positive_balance CHECK (balance >= 0),
            CONSTRAINT positive_recharged CHECK (total_recharged >= 0),
            CONSTRAINT positive_consumed CHECK (total_consumed >= 0)
          );
        `;
        
        console.log('✅ user_credit_balance 表创建成功');
        
        // 启用 RLS
        await supabase.sql`ALTER TABLE user_credit_balance ENABLE ROW LEVEL SECURITY;`;
        console.log('✅ user_credit_balance RLS 已启用');
        
      } catch (sqlCreditError) {
        console.error('❌ 创建 user_credit_balance 表失败:', sqlCreditError);
      }
      
    } else if (creditTableError) {
      console.error('❌ 检查 user_credit_balance 表时出错:', creditTableError);
    } else {
      console.log('✅ user_credit_balance 表已存在');
    }
    
    console.log('🎉 认证数据库修复完成！');
    console.log('现在可以尝试重新登录了。');
    console.log('');
    console.log('如果仍然遇到问题，请检查:');
    console.log('1. Supabase 项目的 RLS 设置');
    console.log('2. 服务角色密钥的权限');
    console.log('3. 数据库连接设置');
    
  } catch (error) {
    console.error('❌ 修复过程中出现错误:', error);
    console.error('错误详情:', error.message);
    if (error.stack) {
      console.error('错误堆栈:', error.stack);
    }
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🚀 启动数据库修复脚本...');
  fixAuthDatabase()
    .then(() => {
      console.log('✅ 脚本执行完成');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ 脚本执行失败:', error);
      process.exit(1);
    });
}

export { fixAuthDatabase }; 