import { NextRequest, NextResponse } from "next/server";
import { createClient } from "~/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    console.log("🔧 开始修复积分系统数据库函数...");
    
    const supabase = await createClient();
    const results = [];

    // 1. 首先删除所有可能的重复函数定义
    try {
      console.log("🗑️ 删除重复的consume_credits_v2函数...");
      
      const { error: dropError } = await supabase.rpc('sql', {
        query: `
          -- 删除所有可能的consume_credits_v2函数重载
          DROP FUNCTION IF EXISTS public.consume_credits_v2(UUID, TEXT, INTEGER, TEXT) CASCADE;
          DROP FUNCTION IF EXISTS public.consume_credits_v2(p_user_id UUID, action_type TEXT, amount_override INTEGER, transaction_description TEXT) CASCADE;
          DROP FUNCTION IF EXISTS public.consume_credits_v2(user_id UUID, action_type TEXT, amount_override INTEGER, transaction_description TEXT) CASCADE;
        `
      });

      if (dropError) {
        console.log("⚠️ 删除函数时的警告（正常）:", dropError.message);
      }

      results.push({
        step: 'drop_duplicate_functions',
        status: 'success',
        message: '已删除重复的函数定义'
      });
    } catch (error) {
      console.error('❌ 删除重复函数失败:', error);
      results.push({
        step: 'drop_duplicate_functions',
        status: 'warning',
        message: `删除重复函数时遇到问题: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }

    // 2. 创建统一的consume_credits_v2函数
    try {
      console.log("💰 创建统一的consume_credits_v2函数...");
      
      const { error: createError } = await supabase.rpc('sql', {
        query: `
          CREATE OR REPLACE FUNCTION consume_credits_v2(
            p_user_id UUID,
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
            WHERE user_credit_balance.user_id = p_user_id;

            -- 如果用户没有积分记录，先创建
            IF v_balance_record IS NULL THEN
              PERFORM get_or_create_user_credit_balance(p_user_id);
              SELECT * INTO v_balance_record
              FROM user_credit_balance
              WHERE user_credit_balance.user_id = p_user_id;
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
            WHERE user_credit_balance.user_id = p_user_id;

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
              p_user_id,
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

      if (createError) {
        throw createError;
      }

      results.push({
        step: 'create_unified_function',
        status: 'success',
        message: '已创建统一的consume_credits_v2函数'
      });
    } catch (error) {
      console.error('❌ 创建统一函数失败:', error);
      results.push({
        step: 'create_unified_function',
        status: 'error',
        message: `创建统一函数失败: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }

    // 3. 确保get_user_credits_v2函数也是正确的
    try {
      console.log("💰 确保get_user_credits_v2函数正确...");
      
      const { error: getCreditsError } = await supabase.rpc('sql', {
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

      if (getCreditsError) {
        throw getCreditsError;
      }

      results.push({
        step: 'ensure_get_credits_function',
        status: 'success',
        message: '已确保get_user_credits_v2函数正确'
      });
    } catch (error) {
      console.error('❌ 确保get_user_credits_v2函数失败:', error);
      results.push({
        step: 'ensure_get_credits_function',
        status: 'error',
        message: `确保get_user_credits_v2函数失败: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }

    // 4. 测试函数是否正常工作
    try {
      console.log("🧪 测试积分函数...");
      
      // 获取当前用户（如果有的话）
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        // 测试获取积分
        const { data: creditsData, error: creditsError } = await supabase.rpc('get_user_credits_v2', {
          p_user_id: user.id
        });

        if (creditsError) {
          throw creditsError;
        }

        results.push({
          step: 'test_functions',
          status: 'success',
          message: `函数测试通过，当前用户积分: ${creditsData.balance}`,
          data: creditsData
        });
      } else {
        results.push({
          step: 'test_functions',
          status: 'info',
          message: '无当前用户，跳过函数测试'
        });
      }
    } catch (error) {
      console.error('❌ 测试函数失败:', error);
      results.push({
        step: 'test_functions',
        status: 'warning',
        message: `函数测试失败: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }

    const totalSteps = results.length;
    const successCount = results.filter(r => r.status === 'success').length;
    const errorCount = results.filter(r => r.status === 'error').length;

    console.log(`✅ 积分系统修复完成: ${successCount}/${totalSteps} 成功, ${errorCount} 错误`);

    return NextResponse.json({
      success: errorCount === 0,
      message: `积分系统修复完成`,
      summary: {
        total: totalSteps,
        success: successCount,
        errors: errorCount,
        warnings: results.filter(r => r.status === 'warning').length
      },
      results,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error("❌ 积分系统修复失败:", error);
    
    return NextResponse.json({
      success: false,
      error: "积分系统修复失败",
      details: error instanceof Error ? error.message : "未知错误",
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: "积分系统修复端点",
    usage: "使用 POST 方法来执行积分系统修复",
    description: "此端点用于修复数据库中重复的积分函数定义问题"
  });
} 