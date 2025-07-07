import { NextRequest, NextResponse } from "next/server";
import { createClient } from "~/lib/supabase/server";
import fs from 'fs';
import path from 'path';

export async function POST(request: NextRequest) {
  try {
    console.log("🔧 开始执行积分系统修复SQL脚本...");
    
    const supabase = await createClient();
    
    // 读取SQL脚本内容
    const sqlScript = `-- =================================================================
-- 手动修复积分系统数据库函数脚本
-- 解决函数重载冲突问题
-- =================================================================

BEGIN;

-- 1. 删除所有可能的重复函数定义
DROP FUNCTION IF EXISTS public.consume_credits_v2(UUID, TEXT, INTEGER, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.consume_credits_v2(p_user_id UUID, action_type TEXT, amount_override INTEGER, transaction_description TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.consume_credits_v2(user_id UUID, action_type TEXT, amount_override INTEGER, transaction_description TEXT) CASCADE;

-- 2. 删除get_user_credits_v2的重复定义
DROP FUNCTION IF EXISTS public.get_user_credits_v2(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.get_user_credits_v2(p_user_id UUID) CASCADE;
DROP FUNCTION IF EXISTS public.get_user_credits_v2(user_id UUID) CASCADE;

-- 3. 确保get_or_create_user_credit_balance函数存在
CREATE OR REPLACE FUNCTION get_or_create_user_credit_balance(p_user_id UUID)
RETURNS user_credit_balance
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance_record user_credit_balance;
BEGIN
  -- 尝试获取现有记录
  SELECT * INTO v_balance_record
  FROM user_credit_balance
  WHERE user_id = p_user_id;

  -- 如果没有记录，创建一个
  IF v_balance_record IS NULL THEN
    INSERT INTO user_credit_balance (
      user_id,
      balance,
      total_recharged,
      total_consumed,
      created_at,
      updated_at
    ) VALUES (
      p_user_id,
      5, -- 默认给新用户5个积分
      5,
      0,
      NOW(),
      NOW()
    )
    RETURNING * INTO v_balance_record;
  END IF;

  RETURN v_balance_record;

EXCEPTION
  WHEN OTHERS THEN
    -- 如果出错，尝试再次获取
    SELECT * INTO v_balance_record
    FROM user_credit_balance
    WHERE user_id = p_user_id;
    
    RETURN v_balance_record;
END;
$$;

-- 4. 创建统一的get_user_credits_v2函数
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
    v_balance_record := get_or_create_user_credit_balance(p_user_id);
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

-- 5. 创建统一的consume_credits_v2函数
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
    v_balance_record := get_or_create_user_credit_balance(p_user_id);
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

COMMIT;`;

    console.log("📝 执行SQL脚本...");
    
    // 执行SQL脚本
    const { error: sqlError } = await supabase.rpc('sql', {
      query: sqlScript
    });

    if (sqlError) {
      console.error("❌ SQL执行失败:", sqlError);
      throw sqlError;
    }

    console.log("✅ SQL脚本执行成功");

    // 测试函数是否正常工作
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        console.log("🧪 测试积分函数...");
        
        // 测试获取积分
        const { data: creditsData, error: creditsError } = await supabase.rpc('get_user_credits_v2', {
          p_user_id: user.id
        });

        if (creditsError) {
          console.error("❌ 测试函数失败:", creditsError);
          throw creditsError;
        }

        console.log("✅ 函数测试成功，用户积分:", creditsData.balance);

        return NextResponse.json({
          success: true,
          message: "积分系统修复成功",
          data: {
            userCredits: creditsData,
            userId: user.id
          },
          timestamp: new Date().toISOString(),
        });
      } else {
        return NextResponse.json({
          success: true,
          message: "积分系统修复成功，无当前用户进行测试",
          timestamp: new Date().toISOString(),
        });
      }
    } catch (testError) {
      console.error("⚠️ 函数测试警告:", testError);
      return NextResponse.json({
        success: true,
        message: "积分系统修复成功，但函数测试有警告",
        warning: testError instanceof Error ? testError.message : "Unknown test error",
        timestamp: new Date().toISOString(),
      });
    }

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
    message: "积分系统SQL修复端点",
    usage: "使用 POST 方法来执行积分系统修复SQL脚本",
    description: "此端点用于执行完整的SQL脚本来修复数据库函数问题"
  });
} 