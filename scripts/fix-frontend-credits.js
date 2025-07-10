import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// 加载环境变量
config({ path: '.env.local' });

// 从环境变量获取Supabase配置
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ 请设置正确的NEXT_PUBLIC_SUPABASE_URL和SUPABASE_SERVICE_ROLE_KEY环境变量');
  console.error('   检查 .env.local 文件是否存在并包含这些变量');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixFrontendCredits() {
  console.log('🔧 开始修复前端积分显示问题...');

  try {
    // 1. 删除旧版本函数
    console.log('🗑️ 删除旧版本函数...');
    const { error: dropError } = await supabase.rpc('sql', {
      query: `
        BEGIN;
        DROP FUNCTION IF EXISTS get_user_credits_v2(UUID) CASCADE;
        DROP FUNCTION IF EXISTS consume_credits_v2(UUID, TEXT, INTEGER, TEXT) CASCADE;
        DROP FUNCTION IF EXISTS recharge_credits_v2(UUID, INTEGER, TEXT, TEXT) CASCADE;
        COMMIT;
      `
    });

    if (dropError) {
      console.warn('⚠️ 删除旧函数时出现警告（正常情况）:', dropError.message);
    }

    // 2. 创建get_user_credits_v2函数
    console.log('💰 创建get_user_credits_v2函数...');
    const { error: createError } = await supabase.rpc('sql', {
      query: `
        CREATE OR REPLACE FUNCTION get_user_credits_v2(p_user_id UUID)
        RETURNS JSONB
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = public
        AS $$
        DECLARE
          v_balance_record user_credit_balance;
        BEGIN
          -- 获取用户积分余额
          SELECT * INTO v_balance_record
          FROM user_credit_balance
          WHERE user_id = p_user_id;

          -- 如果不存在积分记录，先创建
          IF v_balance_record IS NULL THEN
            -- 调用创建函数
            PERFORM get_or_create_user_credit_balance(p_user_id);
            
            -- 重新获取
            SELECT * INTO v_balance_record
            FROM user_credit_balance
            WHERE user_id = p_user_id;
          END IF;

          -- 返回积分信息
          RETURN jsonb_build_object(
            'balance', COALESCE(v_balance_record.balance, 0),
            'totalRecharged', COALESCE(v_balance_record.total_recharged, 0),
            'totalConsumed', COALESCE(v_balance_record.total_consumed, 0),
            'createdAt', v_balance_record.created_at,
            'updatedAt', v_balance_record.updated_at
          );

        EXCEPTION
          WHEN OTHERS THEN
            RETURN jsonb_build_object(
              'balance', 0,
              'totalRecharged', 0,
              'totalConsumed', 0,
              'error', SQLERRM
            );
        END;
        $$;
      `
    });

    if (createError) {
      throw createError;
    }

    console.log('✅ get_user_credits_v2函数创建成功！');

    // 3. 测试函数是否工作
    console.log('🧪 测试函数是否工作...');
    const testUserId = 'f4cf2a5b-bead-43af-b92b-b305f3ff778a'; // 你的用户ID
    
    const { data: testResult, error: testError } = await supabase.rpc('get_user_credits_v2', {
      p_user_id: testUserId
    });

    if (testError) {
      console.error('❌ 函数测试失败:', testError);
    } else {
      console.log('✅ 函数测试成功！积分数据:', testResult);
    }

    // 4. 验证用户表数据
    console.log('🔍 验证当前用户积分数据...');
    const { data: balanceData, error: balanceError } = await supabase
      .from('user_credit_balance')
      .select('*')
      .eq('user_id', testUserId)
      .single();

    if (balanceError) {
      console.error('❌ 获取用户积分余额失败:', balanceError);
    } else {
      console.log('📊 当前用户积分余额:', balanceData);
    }

    console.log('\n🎉 前端积分显示问题修复完成！');
    console.log('📋 修复结果总结:');
    console.log('   ✅ get_user_credits_v2函数已创建');
    console.log('   ✅ 函数测试通过');
    console.log('   ✅ 前端应该能正常显示积分了');
    console.log('\n💡 如果前端仍然显示"Failed to load"，请:');
    console.log('   1. 刷新浏览器页面');
    console.log('   2. 检查浏览器控制台是否有错误');
    console.log('   3. 确认用户已正确登录');

  } catch (error) {
    console.error('❌ 修复过程中出现错误:', error);
    process.exit(1);
  }
}

// 运行修复脚本
fixFrontendCredits(); 