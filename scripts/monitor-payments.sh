#!/bin/bash

# =================================================================
# 支付积分系统监控脚本
# =================================================================
# 用于定时检查支付系统状态并自动修复问题

set -e

# 配置
DB_HOST="${DB_HOST:-localhost}"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-your_database}"
ADMIN_API_KEY="${ADMIN_API_KEY:-your-admin-key}"
API_URL="${API_URL:-http://localhost:3000}"
SLACK_WEBHOOK="${SLACK_WEBHOOK:-}"

# 日志函数
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# 发送通知
send_notification() {
    local message="$1"
    log "ALERT: $message"
    
    if [[ -n "$SLACK_WEBHOOK" ]]; then
        curl -X POST -H 'Content-type: application/json' \
             --data "{\"text\":\"🚨 支付系统警报: $message\"}" \
             "$SLACK_WEBHOOK" || true
    fi
}

# 检查系统状态
check_system_status() {
    log "检查系统状态..."
    
    local response
    response=$(curl -s -H "Authorization: Bearer $ADMIN_API_KEY" \
                   "$API_URL/api/admin/fix-credits" || echo "")
    
    if [[ -z "$response" ]]; then
        send_notification "无法连接到管理API"
        return 1
    fi
    
    local orphaned_count
    orphaned_count=$(echo "$response" | jq -r '.status.orphanedRecharges // 0')
    
    local stuck_count
    stuck_count=$(echo "$response" | jq -r '.status.stuckPayments // 0')
    
    log "孤立充值记录: $orphaned_count 条"
    log "卡住的支付: $stuck_count 条"
    
    # 如果发现问题，尝试自动修复
    if [[ "$orphaned_count" -gt 0 ]]; then
        log "发现 $orphaned_count 条孤立充值记录，开始自动修复..."
        fix_orphaned_recharges
    fi
    
    if [[ "$stuck_count" -gt 0 ]]; then
        log "发现 $stuck_count 条卡住的支付，需要人工处理"
        send_notification "发现 $stuck_count 条卡住的支付需要人工处理"
    fi
}

# 修复孤立的充值记录
fix_orphaned_recharges() {
    log "开始修复孤立的充值记录..."
    
    local response
    response=$(curl -s -X POST \
                   -H "Authorization: Bearer $ADMIN_API_KEY" \
                   -H "Content-Type: application/json" \
                   -d '{"action":"fix_orphaned_recharges"}' \
                   "$API_URL/api/admin/fix-credits")
    
    local fixed_count
    fixed_count=$(echo "$response" | jq -r '.result.fixedCount // 0')
    
    local total_found
    total_found=$(echo "$response" | jq -r '.result.totalFound // 0')
    
    log "修复完成: $fixed_count/$total_found 条记录"
    
    if [[ "$fixed_count" -gt 0 ]]; then
        send_notification "成功修复了 $fixed_count 条孤立的充值记录"
    fi
    
    if [[ "$fixed_count" -lt "$total_found" ]]; then
        send_notification "警告: 有 $((total_found - fixed_count)) 条记录修复失败，需要人工处理"
    fi
}

# 数据库健康检查
db_health_check() {
    log "执行数据库健康检查..."
    
    # 检查RPC函数是否存在
    local rpc_exists
    rpc_exists=$(psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -t -c \
        "SELECT COUNT(*) FROM information_schema.routines 
         WHERE routine_name = 'handle_stripe_webhook_payment_success';" || echo "0")
    
    if [[ "$rpc_exists" -eq 0 ]]; then
        send_notification "RPC函数 handle_stripe_webhook_payment_success 不存在"
        return 1
    fi
    
    # 检查RLS策略
    local rls_policies
    rls_policies=$(psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -t -c \
        "SELECT COUNT(*) FROM pg_policies 
         WHERE tablename IN ('credit_recharge', 'credit_transaction', 'user_credit_balance')
         AND policyname LIKE '%service_role%';" || echo "0")
    
    if [[ "$rls_policies" -lt 3 ]]; then
        send_notification "RLS策略配置不完整，当前只有 $rls_policies 个策略"
        return 1
    fi
    
    log "数据库健康检查通过"
    return 0
}

# 生成报告
generate_report() {
    log "生成支付系统状态报告..."
    
    local report_file="payment_report_$(date +%Y%m%d_%H%M%S).txt"
    
    {
        echo "支付积分系统状态报告"
        echo "生成时间: $(date)"
        echo "================================"
        echo ""
        
        # 运行诊断SQL
        psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" \
             -f "diagnose_payment_issues.sql" 2>/dev/null || echo "诊断查询失败"
        
    } > "$report_file"
    
    log "报告已生成: $report_file"
}

# 主函数
main() {
    log "开始支付系统监控..."
    
    # 检查必要的工具
    command -v curl >/dev/null 2>&1 || { echo "需要安装 curl"; exit 1; }
    command -v jq >/dev/null 2>&1 || { echo "需要安装 jq"; exit 1; }
    command -v psql >/dev/null 2>&1 || { echo "需要安装 psql"; exit 1; }
    
    # 执行检查
    if db_health_check; then
        check_system_status
    else
        send_notification "数据库健康检查失败"
        exit 1
    fi
    
    # 每周生成一次详细报告
    if [[ "$(date +%w)" == "1" ]] && [[ "$(date +%H)" == "09" ]]; then
        generate_report
    fi
    
    log "监控完成"
}

# 脚本入口
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi 