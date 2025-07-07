import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '~/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    console.log('🔧 开始通过 API 修复认证数据库...');
    
    const supabase = await createClient();
    
    // 检查是否有必要的权限
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ 
        success: false, 
        error: 'Authentication required',
        details: authError?.message || 'No user found'
      }, { status: 401 });
    }
    
    const results = [];
    
    // 1. 检查并创建 user_profiles 表
    try {
      console.log('📊 检查 user_profiles 表...');
      const { error: profileTableError } = await supabase
        .from('user_profiles')
        .select('id')
        .limit(1);
      
      if (profileTableError && profileTableError.code === '42P01') {
        results.push({
          step: 'user_profiles',
          status: 'error',
          message: '表不存在。请执行完整的数据库修复脚本。'
        });
      } else if (profileTableError) {
        results.push({
          step: 'user_profiles',
          status: 'error',
          message: `检查表时出错: ${profileTableError.message}`
        });
      } else {
        // 表存在，尝试创建用户配置
        const { error: insertError } = await supabase
          .from('user_profiles')
          .upsert({
            id: user.id,
            display_name: user.user_metadata?.name || user.email?.split('@')[0],
            first_name: user.user_metadata?.first_name,
            last_name: user.user_metadata?.last_name,
            avatar_url: user.user_metadata?.avatar_url,
            project_id: '0616faceswap'
          }, {
            onConflict: 'id'
          });
        
        if (insertError) {
          results.push({
            step: 'user_profiles',
            status: 'error',
            message: `无法创建用户配置: ${insertError.message}`
          });
        } else {
          results.push({
            step: 'user_profiles',
            status: 'success',
            message: '表已存在且用户配置已创建'
          });
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      results.push({
        step: 'user_profiles',
        status: 'error',
        message: `未知错误: ${errorMessage}`
      });
    }
    
    // 2. 检查并创建 user_credit_balance 表
    try {
      console.log('💰 检查 user_credit_balance 表...');
      const { error: creditTableError } = await supabase
        .from('user_credit_balance')
        .select('id')
        .limit(1);
      
      if (creditTableError && creditTableError.code === '42P01') {
        results.push({
          step: 'user_credit_balance',
          status: 'error',
          message: '表不存在。请执行完整的数据库修复脚本。'
        });
      } else if (creditTableError) {
        results.push({
          step: 'user_credit_balance',
          status: 'error',
          message: `检查表时出错: ${creditTableError.message}`
        });
      } else {
        results.push({
          step: 'user_credit_balance',
          status: 'success',
          message: '表已存在'
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      results.push({
        step: 'user_credit_balance',
        status: 'error',
        message: `未知错误: ${errorMessage}`
      });
    }
    
    // 3. 测试 upsert_user_profile 函数
    try {
      console.log('🔧 测试 upsert_user_profile 函数...');
      const { data: functionResult, error: functionError } = await supabase
        .rpc('upsert_user_profile', {
          p_user_id: user.id,
          p_display_name: user.user_metadata?.name || user.email?.split('@')[0],
          p_first_name: user.user_metadata?.first_name,
          p_last_name: user.user_metadata?.last_name,
          p_avatar_url: user.user_metadata?.avatar_url,
          p_project_id: '0616faceswap'
        });
      
      if (functionError) {
        results.push({
          step: 'upsert_user_profile',
          status: 'error',
          message: `函数调用失败: ${functionError.message}`
        });
      } else {
        results.push({
          step: 'upsert_user_profile',
          status: 'success',
          message: '函数工作正常',
          data: functionResult
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      results.push({
        step: 'upsert_user_profile',
        status: 'error',
        message: `函数测试失败: ${errorMessage}`
      });
    }
    
    // 4. 测试 get_or_create_user_credit_balance 函数
    try {
      console.log('💰 测试 get_or_create_user_credit_balance 函数...');
      const { data: creditResult, error: creditError } = await supabase
        .rpc('get_or_create_user_credit_balance', {
          p_user_id: user.id
        });
      
      if (creditError) {
        results.push({
          step: 'get_or_create_user_credit_balance',
          status: 'error',
          message: `函数调用失败: ${creditError.message}`
        });
      } else {
        results.push({
          step: 'get_or_create_user_credit_balance',
          status: 'success',
          message: '函数工作正常',
          data: creditResult
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      results.push({
        step: 'get_or_create_user_credit_balance',
        status: 'error',
        message: `函数测试失败: ${errorMessage}`
      });
    }
    
    console.log('✅ 数据库修复检查完成');
    
    // 检查是否有任何错误
    const hasErrors = results.some(r => r.status === 'error');
    
    return NextResponse.json({
      success: !hasErrors,
      message: hasErrors ? '发现错误，请执行完整的数据库修复脚本' : '数据库检查通过',
      user_id: user.id,
      results,
      ...(hasErrors && {
        recommendation: '建议下载并执行完整的数据库清理脚本：/api/sql-script'
      })
    });
    
  } catch (error) {
    console.error('❌ API 修复过程中出现错误:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      details: errorMessage,
      recommendation: '建议下载并执行完整的数据库清理脚本：/api/sql-script'
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    message: '数据库修复 API',
    instructions: [
      '发送 POST 请求到这个端点来测试和修复数据库',
      '确保已登录以获得必要的权限',
      '如果遇到表不存在的错误，请下载并执行完整的清理脚本'
    ],
    sql_script_location: '/api/sql-script',
    warning: '新的脚本会删除旧数据并重建表结构，请谨慎使用'
  });
} 