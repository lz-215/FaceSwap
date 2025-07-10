import { NextRequest, NextResponse } from "next/server";
import { createClient } from "~/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    console.log("🔧 开始执行RLS和积分函数修复...");
    
    const supabase = await createClient();
    
    console.log("📝 执行SQL脚本...");
    
    // 将大的SQL脚本分解为独立的函数创建语句
    const sqlStatements = [
      // 1. 创建recharge_credits_v2函数
      `CREATE OR REPLACE FUNCTION recharge_credits_v2(
          p_user_id UUID,
          amount_to_add INTEGER,
          payment_intent_id TEXT DEFAULT NULL,
          transaction_description TEXT DEFAULT NULL
      )
      RETURNS JSONB
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $$
      DECLARE
          v_balance_record user_credit_balance;
          v_new_balance INTEGER;
          v_description TEXT := COALESCE(transaction_description, '充值积分');
          v_transaction_id UUID;
      BEGIN
          SELECT * INTO v_balance_record FROM user_credit_balance WHERE user_id = p_user_id;
          IF v_balance_record IS NULL THEN
              INSERT INTO user_credit_balance (user_id, balance, total_recharged, total_consumed, created_at, updated_at)
              VALUES (p_user_id, amount_to_add, amount_to_add, 0, NOW(), NOW())
              RETURNING * INTO v_balance_record;
              v_new_balance := amount_to_add;
          ELSE
              v_new_balance := v_balance_record.balance + amount_to_add;
              UPDATE user_credit_balance SET balance = v_new_balance, total_recharged = total_recharged + amount_to_add, updated_at = NOW()
              WHERE id = v_balance_record.id;
          END IF;
          INSERT INTO credit_transaction (user_id, amount, type, description, balance_after, metadata, created_at)
          VALUES (p_user_id, amount_to_add, 'recharge', v_description, v_new_balance,
                  CASE WHEN payment_intent_id IS NOT NULL THEN jsonb_build_object('payment_intent_id', payment_intent_id) ELSE '{}'::jsonb END,
                  NOW()) RETURNING id INTO v_transaction_id;
          RETURN jsonb_build_object('success', true, 'balanceAfter', v_new_balance, 'amountAdded', amount_to_add, 'transactionId', v_transaction_id, 'message', '积分充值成功');
      EXCEPTION
          WHEN OTHERS THEN
              RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'message', '积分充值失败');
      END;
      $$`,

      // 2. 创建add_bonus_credits_v2函数
      `CREATE OR REPLACE FUNCTION add_bonus_credits_v2(
          p_user_id UUID,
          bonus_amount INTEGER,
          bonus_reason TEXT,
          bonus_metadata JSONB DEFAULT '{}'::jsonb
      )
      RETURNS JSONB
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $$
      DECLARE
          v_balance_record user_credit_balance;
          v_new_balance INTEGER;
          v_transaction_id UUID;
      BEGIN
          SELECT * INTO v_balance_record FROM user_credit_balance WHERE user_id = p_user_id;
          IF v_balance_record IS NULL THEN
              INSERT INTO user_credit_balance (user_id, balance, total_recharged, total_consumed, created_at, updated_at)
              VALUES (p_user_id, bonus_amount, bonus_amount, 0, NOW(), NOW())
              RETURNING * INTO v_balance_record;
              v_new_balance := bonus_amount;
          ELSE
              v_new_balance := v_balance_record.balance + bonus_amount;
              UPDATE user_credit_balance SET balance = v_new_balance, total_recharged = total_recharged + bonus_amount, updated_at = NOW()
              WHERE id = v_balance_record.id;
          END IF;
          INSERT INTO credit_transaction (user_id, amount, type, description, balance_after, metadata, created_at)
          VALUES (p_user_id, bonus_amount, 'bonus', bonus_reason, v_new_balance, bonus_metadata, NOW())
          RETURNING id INTO v_transaction_id;
          RETURN jsonb_build_object('success', true, 'balanceAfter', v_new_balance, 'amountAdded', bonus_amount, 'transactionId', v_transaction_id, 'message', '奖励积分添加成功');
      EXCEPTION
          WHEN OTHERS THEN
              RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'message', '奖励积分添加失败');
      END;
      $$`,

      // 3. 修复RLS策略
      `DROP POLICY IF EXISTS "Service role can manage credit balance" ON user_credit_balance`,
      `CREATE POLICY "Service role can manage credit balance" ON user_credit_balance FOR ALL USING (auth.role() = 'service_role')`,
      `DROP POLICY IF EXISTS "Users can insert own credit balance" ON user_credit_balance`,
      `CREATE POLICY "Users can insert own credit balance" ON user_credit_balance FOR INSERT WITH CHECK (auth.uid() = user_id)`,
      `DROP POLICY IF EXISTS "Service role can manage transactions" ON credit_transaction`,
      `CREATE POLICY "Service role can manage transactions" ON credit_transaction FOR ALL USING (auth.role() = 'service_role')`,
      `DROP POLICY IF EXISTS "Users can insert own transactions" ON credit_transaction`,
      `CREATE POLICY "Users can insert own transactions" ON credit_transaction FOR INSERT WITH CHECK (auth.uid() = user_id)`,
      `DROP POLICY IF EXISTS "Users can view own subscription credits" ON subscription_credits`,
      `CREATE POLICY "Users can view own subscription credits" ON subscription_credits FOR SELECT USING (auth.uid() = user_id)`,
      `DROP POLICY IF EXISTS "Service role can manage subscription credits" ON subscription_credits`,
      `CREATE POLICY "Service role can manage subscription credits" ON subscription_credits FOR ALL USING (auth.role() = 'service_role')`,
      `DROP POLICY IF EXISTS "Users can insert own subscription credits" ON subscription_credits`,
      `CREATE POLICY "Users can insert own subscription credits" ON subscription_credits FOR INSERT WITH CHECK (auth.uid() = user_id)`
    ];

    const results = [];
    
    // 逐个执行SQL语句
    for (let i = 0; i < sqlStatements.length; i++) {
      const statement = sqlStatements[i];
      try {
        console.log(`执行SQL语句 ${i + 1}/${sqlStatements.length}: ${statement.substring(0, 50)}...`);
        
        const { error } = await supabase.rpc('exec_sql', {
          sql_query: statement
        });
        
        if (error) {
          console.error(`SQL语句 ${i + 1} 执行失败:`, error);
          results.push({ 
            step: i + 1, 
            status: 'error', 
            error: error.message,
            statement: statement.substring(0, 100) + '...'
          });
        } else {
          console.log(`✅ SQL语句 ${i + 1} 执行成功`);
          results.push({ 
            step: i + 1, 
            status: 'success',
            statement: statement.substring(0, 100) + '...'
          });
        }
      } catch (partError) {
        console.error(`SQL语句 ${i + 1} 执行异常:`, partError);
        results.push({ 
          step: i + 1, 
          status: 'error', 
          error: partError instanceof Error ? partError.message : '未知错误',
          statement: statement.substring(0, 100) + '...'
        });
      }
    }

    console.log("✅ SQL语句执行完成");

    // 检查执行结果
    const successCount = results.filter(r => r.status === 'success').length;
    const errorCount = results.filter(r => r.status === 'error').length;

    return NextResponse.json({
      success: successCount > 0,
      message: `修复完成: ${successCount} 成功, ${errorCount} 失败`,
      results: results,
      summary: {
        total: sqlStatements.length,
        success: successCount,
        error: errorCount
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("❌ 修复过程失败:", error);
    return NextResponse.json(
      {
        success: false,
        message: "修复过程失败",
        error: error instanceof Error ? error.message : '未知错误'
      },
      { status: 500 }
    );
  }
} 