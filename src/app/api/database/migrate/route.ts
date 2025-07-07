import { NextRequest, NextResponse } from "next/server";
import { createClient } from "~/lib/supabase/server";
import { getCurrentSupabaseUser } from "~/lib/supabase-auth";

export async function POST(request: NextRequest) {
  try {
    // 验证用户权限（可选，根据需要调整）
    const user = await getCurrentSupabaseUser();
    if (!user) {
      return NextResponse.json({ error: "未授权访问" }, { status: 401 });
    }

    console.log(`[database-migrate] 开始执行数据库修复迁移，操作者: ${user.email}`);

    const supabase = await createClient();
    const results = [];

    // 1. 检查并添加email字段
    try {
      console.log('📝 检查user_profiles表的email字段...');
      
      const { data: columns, error: columnsError } = await supabase
        .from('information_schema.columns')
        .select('column_name')
        .eq('table_name', 'user_profiles')
        .eq('column_name', 'email');

      if (columnsError) {
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
          throw addColumnError;
        }

        results.push({
          step: 'add_email_column',
          status: 'success',
          message: '已添加email字段到user_profiles表'
        });
      } else {
        results.push({
          step: 'add_email_column',
          status: 'skipped',
          message: 'email字段已存在'
        });
      }
    } catch (error) {
      console.error('❌ 添加email字段失败:', error);
      results.push({
        step: 'add_email_column',
        status: 'error',
        message: `添加email字段失败: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }

    // 2. 同步现有用户的email
    try {
      console.log('📧 同步用户email...');
      
      const { error: syncEmailError } = await supabase.rpc('sql', {
        query: `
          UPDATE user_profiles 
          SET email = auth_users.email, updated_at = NOW()
          FROM auth.users AS auth_users 
          WHERE user_profiles.id = auth_users.id 
          AND (user_profiles.email IS NULL OR user_profiles.email = '');
        `
      });

      if (syncEmailError) {
        throw syncEmailError;
      }

      results.push({
        step: 'sync_emails',
        status: 'success',
        message: '已同步用户email'
      });
    } catch (error) {
      console.error('❌ 同步email失败:', error);
      results.push({
        step: 'sync_emails',
        status: 'error',
        message: `同步email失败: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }

    // 3. 创建积分查询函数 (v2版本)
    try {
      console.log('💰 创建get_user_credits_v2函数...');
      
      const { error: functionError } = await supabase.rpc('sql', {
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

      if (functionError) {
        throw functionError;
      }

      results.push({
        step: 'create_get_user_credits_v2',
        status: 'success',
        message: '已创建get_user_credits_v2函数'
      });
    } catch (error) {
      console.error('❌ 创建get_user_credits_v2函数失败:', error);
      results.push({
        step: 'create_get_user_credits_v2',
        status: 'error',
        message: `创建get_user_credits_v2函数失败: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }

    // 4. 创建消费积分函数 (v2版本)
    try {
      console.log('💰 创建consume_credits_v2函数...');
      
      const { error: functionError } = await supabase.rpc('sql', {
        query: `
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

      if (functionError) {
        throw functionError;
      }

      results.push({
        step: 'create_consume_credits_v2',
        status: 'success',
        message: '已创建consume_credits_v2函数'
      });
    } catch (error) {
      console.error('❌ 创建consume_credits_v2函数失败:', error);
      results.push({
        step: 'create_consume_credits_v2',
        status: 'error',
        message: `创建consume_credits_v2函数失败: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }

    // 5. 为现有用户初始化积分
    try {
      console.log('🎁 为现有用户初始化积分...');
      
      // 获取所有没有积分记录的用户
      const { data: usersWithoutCredits, error: usersError } = await supabase
        .from('auth.users')
        .select('id')
        .not('id', 'in', 
          `(SELECT user_id FROM user_credit_balance)`
        );

      if (usersError) {
        throw usersError;
      }

      let initializedCount = 0;
      if (usersWithoutCredits && usersWithoutCredits.length > 0) {
        for (const user of usersWithoutCredits) {
          try {
            await supabase.rpc('get_or_create_user_credit_balance', {
              p_user_id: user.id
            });
            initializedCount++;
          } catch (error) {
            console.error(`❌ 为用户 ${user.id} 初始化积分失败:`, error);
          }
        }
      }

      results.push({
        step: 'initialize_credits',
        status: 'success',
        message: `已为 ${initializedCount} 个用户初始化积分`
      });
    } catch (error) {
      console.error('❌ 初始化积分失败:', error);
      results.push({
        step: 'initialize_credits',
        status: 'error',
        message: `初始化积分失败: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }

    // 6. 测试函数是否正常工作
    try {
      console.log('🧪 测试积分函数...');
      
      const { data: testResult, error: testError } = await supabase
        .rpc('get_user_credits_v2', {
          p_user_id: user.id
        });

      if (testError) {
        throw testError;
      }

      results.push({
        step: 'test_functions',
        status: 'success',
        message: '积分函数测试通过',
        data: testResult
      });
    } catch (error) {
      console.error('❌ 测试积分函数失败:', error);
      results.push({
        step: 'test_functions',
        status: 'error',
        message: `测试积分函数失败: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }

    const hasErrors = results.some(r => r.status === 'error');
    
    console.log(`[database-migrate] 数据库迁移完成，结果: ${hasErrors ? '部分失败' : '成功'}`);

    return NextResponse.json({
      success: !hasErrors,
      message: hasErrors ? '数据库迁移部分失败，请检查错误详情' : '数据库迁移成功完成！',
      user_id: user.id,
      results,
      summary: {
        total: results.length,
        success: results.filter(r => r.status === 'success').length,
        error: results.filter(r => r.status === 'error').length,
        skipped: results.filter(r => r.status === 'skipped').length,
      }
    });

  } catch (error) {
    console.error("[database-migrate] 迁移过程中发生错误:", error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : "数据库迁移失败",
        success: false 
      },
      { status: 500 }
    );
  }
} 