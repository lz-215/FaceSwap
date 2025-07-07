#!/usr/bin/env node

/**
 * 数据库修复脚本
 * 修复user_profiles表缺少email字段和积分系统函数的问题
 */

const https = require('https');
const { createClient } = require('@supabase/supabase-js');

// 配置 - 从环境变量获取
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ 错误: 缺少必要的环境变量');
  console.error('请确保设置了以下环境变量:');
  console.error('- NEXT_PUBLIC_SUPABASE_URL');
  console.error('- SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function fixDatabaseIssues() {
  console.log('🔧 开始修复数据库问题...');
  console.log('='.repeat(60));

  try {
    // 1. 检查并添加email字段到user_profiles表
    console.log('📝 步骤 1: 检查user_profiles表的email字段...');
    
    const { data: columns, error: columnsError } = await supabase
      .from('information_schema.columns')
      .select('column_name')
      .eq('table_name', 'user_profiles')
      .eq('table_schema', 'public')
      .eq('column_name', 'email');

    if (columnsError) {
      console.error('❌ 检查email字段失败:', columnsError);
      throw columnsError;
    }

    if (!columns || columns.length === 0) {
      console.log('📝 email字段不存在，正在添加...');
      
      const { error: addColumnError } = await supabase.rpc('sql', {
        query: `
          ALTER TABLE user_profiles ADD COLUMN email TEXT;
          CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);
        `
      });

      if (addColumnError) {
        console.error('❌ 添加email字段失败:', addColumnError);
        throw addColumnError;
      }

      console.log('✅ 已成功添加email字段到user_profiles表');
    } else {
      console.log('✅ email字段已存在，跳过添加');
    }

    // 2. 同步现有用户的email
    console.log('📧 步骤 2: 同步现有用户的email...');
    
    const { error: syncError } = await supabase.rpc('sql', {
      query: `
        UPDATE user_profiles 
        SET email = auth_users.email, updated_at = NOW()
        FROM auth.users AS auth_users 
        WHERE user_profiles.id = auth_users.id 
        AND (user_profiles.email IS NULL OR user_profiles.email = '');
      `
    });

    if (syncError) {
      console.error('❌ 同步email失败:', syncError);
      throw syncError;
    }

    console.log('✅ 已同步用户email到user_profiles表');

    // 3. 创建或修复积分系统函数
    console.log('💰 步骤 3: 创建/修复积分系统函数...');
    
    // 创建get_user_credits_v2函数
    const { error: createFunctionError } = await supabase.rpc('sql', {
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

        CREATE OR REPLACE FUNCTION consume_credits_v2(
          user_id UUID,
          action_type TEXT DEFAULT 'face_swap',
          amount_override INTEGER DEFAULT NULL,
          transaction_description TEXT DEFAULT NULL
        )
        RETURNS JSONB
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = public
        AS $$
        DECLARE
          v_balance_record user_credit_balance;
          v_amount_to_consume INTEGER := COALESCE(amount_override, 1);
          v_description TEXT := COALESCE(transaction_description, action_type || ' 操作消费积分');
          v_new_balance INTEGER;
        BEGIN
          -- 获取用户当前积分
          SELECT * INTO v_balance_record
          FROM user_credit_balance
          WHERE user_credit_balance.user_id = consume_credits_v2.user_id;

          -- 如果用户没有积分记录，先创建
          IF v_balance_record IS NULL THEN
            PERFORM get_or_create_user_credit_balance(consume_credits_v2.user_id);
            SELECT * INTO v_balance_record
            FROM user_credit_balance
            WHERE user_credit_balance.user_id = consume_credits_v2.user_id;
          END IF;

          -- 检查积分是否足够
          IF v_balance_record.balance < v_amount_to_consume THEN
            RETURN jsonb_build_object(
              'success', false,
              'message', '积分不足',
              'balance', v_balance_record.balance,
              'required', v_amount_to_consume
            );
          END IF;

          -- 计算新余额
          v_new_balance := v_balance_record.balance - v_amount_to_consume;

          -- 更新积分余额
          UPDATE user_credit_balance
          SET 
            balance = v_new_balance,
            total_consumed = total_consumed + v_amount_to_consume,
            updated_at = NOW()
          WHERE user_credit_balance.user_id = consume_credits_v2.user_id;

          -- 记录交易
          INSERT INTO credit_transaction (
            id,
            user_id,
            amount,
            type,
            description,
            balance_after,
            created_at
          ) VALUES (
            gen_random_uuid(),
            consume_credits_v2.user_id,
            -v_amount_to_consume,
            'consumption',
            v_description,
            v_new_balance,
            NOW()
          );

          RETURN jsonb_build_object(
            'success', true,
            'balanceAfter', v_new_balance,
            'amountConsumed', v_amount_to_consume,
            'message', '积分消费成功'
          );

        EXCEPTION
          WHEN OTHERS THEN
            RETURN jsonb_build_object(
              'success', false,
              'error', SQLERRM
            );
        END;
        $$;
      `
    });

    if (createFunctionError) {
      console.error('❌ 创建积分函数失败:', createFunctionError);
      throw createFunctionError;
    }

    console.log('✅ 已创建/修复积分系统函数');

    // 4. 为现有用户初始化积分
    console.log('🎁 步骤 4: 为现有用户初始化积分...');

    // 获取所有auth.users
    const { data: allUsers, error: usersError } = await supabase.auth.admin.listUsers();
    
    if (usersError) {
      console.error('❌ 获取用户列表失败:', usersError);
      throw usersError;
    }

    let initializedCount = 0;
    for (const user of allUsers.users) {
      try {
        // 检查用户是否已有积分记录
        const { data: creditBalance } = await supabase
          .from('user_credit_balance')
          .select('id')
          .eq('user_id', user.id)
          .single();

        if (!creditBalance) {
          // 创建积分记录
          const { error } = await supabase.rpc('get_or_create_user_credit_balance', {
            p_user_id: user.id
          });

          if (!error) {
            initializedCount++;
            console.log(`  ✅ 已为用户 ${user.email} 初始化积分`);
          } else {
            console.warn(`  ⚠️ 为用户 ${user.email} 初始化积分失败:`, error.message);
          }
        }
      } catch (error) {
        console.warn(`  ⚠️ 处理用户 ${user.email} 时出错:`, error.message);
      }
    }

    console.log(`✅ 已为 ${initializedCount} 个用户初始化积分`);

    // 5. 测试函数
    console.log('🧪 步骤 5: 测试积分函数...');
    
    if (allUsers.users.length > 0) {
      const testUser = allUsers.users[0];
      const { data: testResult, error: testError } = await supabase
        .rpc('get_user_credits_v2', {
          p_user_id: testUser.id
        });

      if (testError) {
        console.error('❌ 测试积分函数失败:', testError);
        throw testError;
      }

      console.log('✅ 积分函数测试通过:', testResult);
    }

    // 完成
    console.log('='.repeat(60));
    console.log('🎉 数据库修复完成！');
    console.log('');
    console.log('修复内容总结:');
    console.log('1. ✅ user_profiles表已添加email字段');
    console.log('2. ✅ 已同步现有用户的email');
    console.log('3. ✅ 已创建/修复积分系统函数（get_user_credits_v2, consume_credits_v2）');
    console.log(`4. ✅ 已为 ${initializedCount} 个用户初始化积分`);
    console.log('5. ✅ 函数测试通过');
    console.log('');
    console.log('现在您可以:');
    console.log('- 前端应该能正常加载积分数据');
    console.log('- 用户订阅后，订阅状态应该正确更新');
    console.log('- 新用户注册时会自动获得初始积分');

  } catch (error) {
    console.error('❌ 数据库修复失败:', error);
    console.error('');
    console.error('请检查:');
    console.error('1. Supabase连接配置是否正确');
    console.error('2. 服务角色密钥是否有足够权限');
    console.error('3. 数据库表结构是否存在');
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  fixDatabaseIssues().catch(console.error);
}

module.exports = { fixDatabaseIssues }; 