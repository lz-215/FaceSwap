# 🚨 生产环境支付问题紧急修复指南

## 📋 问题总结
- **问题**: 支付成功后积分没有增加，没有支付记录
- **原因**: RLS（行级安全策略）权限限制，Stripe webhook无法写入数据库
- **影响**: 用户支付了但没有收到积分

## 🛠️ 立即修复步骤

### 1️⃣ 数据库修复（最重要）

**使用Supabase SQL编辑器：**
1. 登录 [Supabase Dashboard](https://app.supabase.com)
2. 选择您的项目
3. 进入 "SQL Editor"
4. 复制并执行以下完整脚本：

```sql
-- 支付积分问题紧急修复脚本
-- 立即修复RLS权限和孤立充值记录

-- 1. 创建服务角色权限策略
DROP POLICY IF EXISTS "Service role can manage all credit recharges" ON public.credit_recharge;
CREATE POLICY "Service role can manage all credit recharges" 
ON public.credit_recharge FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can manage all credit transactions" ON public.credit_transaction;
CREATE POLICY "Service role can manage all credit transactions" 
ON public.credit_transaction FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can manage all credit balances" ON public.user_credit_balance;
CREATE POLICY "Service role can manage all credit balances" 
ON public.user_credit_balance FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. 创建webhook处理RPC函数
CREATE OR REPLACE FUNCTION handle_stripe_webhook_payment_success(
  p_payment_intent_id TEXT,
  p_recharge_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recharge_record credit_recharge;
  v_user_balance user_credit_balance;
  v_new_balance INTEGER;
  v_transaction_id TEXT;
BEGIN
  -- 查找并锁定充值记录
  SELECT * INTO v_recharge_record
  FROM credit_recharge
  WHERE id = p_recharge_id AND payment_intent_id = p_payment_intent_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recharge record not found: % with payment_intent: %', p_recharge_id, p_payment_intent_id;
  END IF;

  -- 检查是否已经处理过
  IF v_recharge_record.status = 'completed' THEN
    IF EXISTS (SELECT 1 FROM credit_transaction WHERE related_recharge_id = p_recharge_id) THEN
      SELECT balance INTO v_new_balance FROM user_credit_balance WHERE user_id = v_recharge_record.user_id;
      RETURN jsonb_build_object('success', true, 'duplicate', true, 'newBalance', COALESCE(v_new_balance, 0), 'message', 'Already processed');
    END IF;
  ELSE
    UPDATE credit_recharge SET status = 'completed', updated_at = NOW() WHERE id = p_recharge_id;
  END IF;

  -- 获取或创建用户积分余额
  SELECT * INTO v_user_balance FROM user_credit_balance WHERE user_id = v_recharge_record.user_id FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO user_credit_balance (id, user_id, balance, total_recharged, total_consumed, created_at, updated_at)
    VALUES (gen_random_uuid()::text, v_recharge_record.user_id, v_recharge_record.amount, v_recharge_record.amount, 0, NOW(), NOW())
    RETURNING * INTO v_user_balance;
    v_new_balance := v_recharge_record.amount;
  ELSE
    v_new_balance := v_user_balance.balance + v_recharge_record.amount;
    UPDATE user_credit_balance 
    SET balance = v_new_balance, total_recharged = total_recharged + v_recharge_record.amount, updated_at = NOW()
    WHERE user_id = v_recharge_record.user_id;
  END IF;

  -- 创建积分交易记录
  v_transaction_id := gen_random_uuid()::text;
  INSERT INTO credit_transaction (id, user_id, type, amount, balance_after, description, related_recharge_id, metadata, created_at)
  VALUES (v_transaction_id, v_recharge_record.user_id, 'recharge', v_recharge_record.amount, v_new_balance, 
          '充值' || v_recharge_record.amount || '积分', p_recharge_id,
          jsonb_build_object('paymentIntentId', p_payment_intent_id, 'webhookProcessed', true, 'processedAt', NOW()),
          NOW());

  RETURN jsonb_build_object('success', true, 'duplicate', false, 'rechargeId', p_recharge_id, 
                           'transactionId', v_transaction_id, 'newBalance', v_new_balance, 
                           'amountAdded', v_recharge_record.amount, 'userId', v_recharge_record.user_id, 
                           'message', 'Payment processed successfully');
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to process payment webhook: %', SQLERRM;
END;
$$;

-- 设置函数权限
GRANT EXECUTE ON FUNCTION handle_stripe_webhook_payment_success TO service_role;
GRANT EXECUTE ON FUNCTION handle_stripe_webhook_payment_success TO authenticated;

-- 3. 立即修复所有孤立的充值记录（近30天）
DO $$
DECLARE
  r RECORD;
  result JSONB;
BEGIN
  FOR r IN 
    SELECT cr.id, cr.payment_intent_id
    FROM credit_recharge cr
    LEFT JOIN credit_transaction ct ON cr.id = ct.related_recharge_id
    WHERE cr.status = 'completed' 
      AND ct.id IS NULL
      AND cr.created_at >= NOW() - INTERVAL '30 days'
  LOOP
    BEGIN
      SELECT handle_stripe_webhook_payment_success(r.payment_intent_id, r.id) INTO result;
      RAISE NOTICE '修复充值记录: % - %', r.id, result->>'message';
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE '修复失败: % - %', r.id, SQLERRM;
    END;
  END LOOP;
END $$;

-- 4. 验证修复结果
SELECT 
  '修复结果统计' as summary,
  (SELECT COUNT(*) FROM credit_recharge WHERE status = 'completed' AND created_at >= NOW() - INTERVAL '7 days') as completed_recharges,
  (SELECT COUNT(*) FROM credit_recharge cr 
   LEFT JOIN credit_transaction ct ON cr.id = ct.related_recharge_id 
   WHERE cr.status = 'completed' AND ct.id IS NULL AND cr.created_at >= NOW() - INTERVAL '7 days') as remaining_orphaned,
  CASE 
    WHEN (SELECT COUNT(*) FROM credit_recharge cr 
          LEFT JOIN credit_transaction ct ON cr.id = ct.related_recharge_id 
          WHERE cr.status = 'completed' AND ct.id IS NULL AND cr.created_at >= NOW() - INTERVAL '7 days') = 0 
    THEN '✅ 修复成功' 
    ELSE '❌ 仍有问题' 
  END as status;
```

### 2️⃣ 重新部署应用

webhook处理器已经更新，现在需要重新部署：

```bash
# 如果使用Vercel
vercel --prod

# 如果使用其他平台，执行相应的部署命令
```

### 3️⃣ 验证修复效果

**检查系统状态：**
```sql
-- 在Supabase SQL编辑器中运行此查询
SELECT 
  '系统健康检查' as check_type,
  (SELECT COUNT(*) FROM credit_recharge WHERE created_at >= NOW() - INTERVAL '24 hours') as recent_recharges,
  (SELECT COUNT(*) FROM credit_recharge cr 
   LEFT JOIN credit_transaction ct ON cr.id = ct.related_recharge_id 
   WHERE cr.status = 'completed' AND ct.id IS NULL AND cr.created_at >= NOW() - INTERVAL '24 hours') as orphaned_count,
  (SELECT COUNT(*) FROM credit_transaction WHERE created_at >= NOW() - INTERVAL '24 hours') as recent_transactions;
```

## 🔍 排查特定用户问题

如果有用户反馈积分问题，使用以下查询：

```sql
-- 将 'USER_ID' 替换为实际用户ID
SELECT 
  cr.id as recharge_id,
  cr.amount as credits,
  cr.status,
  cr.payment_intent_id,
  cr.created_at as payment_time,
  ct.id as transaction_id,
  ucb.balance as current_balance,
  CASE 
    WHEN cr.status = 'completed' AND ct.id IS NOT NULL THEN '✅ 正常'
    WHEN cr.status = 'completed' AND ct.id IS NULL THEN '❌ 需要修复'
    ELSE '⏳ 处理中'
  END as status_check
FROM credit_recharge cr
LEFT JOIN credit_transaction ct ON cr.id = ct.related_recharge_id
LEFT JOIN user_credit_balance ucb ON cr.user_id = ucb.user_id
WHERE cr.user_id = 'USER_ID'
ORDER BY cr.created_at DESC
LIMIT 10;
```

## 🚨 紧急处理API（可选）

如果您已经设置了管理员API密钥，可以使用以下API进行批量修复：

```bash
# Windows PowerShell
$headers = @{
    "Content-Type" = "application/json"
    "Authorization" = "Bearer YOUR_ADMIN_API_KEY"
}
$body = @{
    action = "fix_orphaned_recharges"
} | ConvertTo-Json

Invoke-WebRequest -Uri "https://your-domain.com/api/admin/fix-credits" -Method POST -Headers $headers -Body $body
```

## 📊 监控设置

**设置定期检查：**
1. 创建定期查询监控孤立充值
2. 设置告警通知
3. 定期检查系统健康状态

## ✅ 修复确认清单

- [ ] 数据库RLS策略已应用
- [ ] RPC函数已创建并设置权限
- [ ] 孤立充值记录已修复
- [ ] 应用已重新部署
- [ ] 新支付测试正常
- [ ] 现有用户问题已解决

## 🛡️ 预防措施

1. **定期监控**: 每日检查是否有新的孤立充值记录
2. **日志监控**: 关注webhook处理日志
3. **测试环境**: 在测试环境验证所有支付流程
4. **备份策略**: 定期备份支付相关数据

---

**⚠️ 重要提醒：**
- 执行数据库脚本前请确保已备份
- 修复完成后进行充分测试
- 如遇问题请立即回滚并联系技术支持 