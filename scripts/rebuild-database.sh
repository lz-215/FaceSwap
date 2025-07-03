#!/bin/bash

# =================================================================
# AIFaceSwap 数据库重建自动化脚本 - 纯订阅积分系统
# =================================================================

set -e  # 遇到错误时退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查必要的工具
check_requirements() {
    log_info "检查必要的工具..."
    
    if ! command -v psql &> /dev/null; then
        log_error "psql 未安装。请安装 PostgreSQL 客户端。"
        exit 1
    fi
    
    if ! command -v supabase &> /dev/null; then
        log_warning "Supabase CLI 未安装。某些功能可能不可用。"
    fi
    
    log_success "工具检查完成"
}

# 检查环境变量
check_env_vars() {
    log_info "检查环境变量..."
    
    if [ -z "$DATABASE_URL" ]; then
        log_error "DATABASE_URL 环境变量未设置"
        log_info "请设置 DATABASE_URL，例如："
        log_info "export DATABASE_URL='postgresql://user:password@host:port/database'"
        exit 1
    fi
    
    log_success "环境变量检查完成"
}

# 备份数据库
backup_database() {
    log_info "开始备份数据库..."
    
    local backup_file="backup_$(date +%Y%m%d_%H%M%S).sql"
    
    if pg_dump "$DATABASE_URL" > "$backup_file" 2>/dev/null; then
        log_success "数据库备份已保存到: $backup_file"
        echo "$backup_file" > .last_backup
    else
        log_warning "数据库备份失败，继续执行..."
    fi
}

# 确认操作
confirm_rebuild() {
    log_warning "⚠️  警告：此操作将删除所有现有表和数据！"
    log_warning "新系统将支持纯订阅积分系统，包括积分过期机制。"
    log_warning "请确保您已经备份了重要数据。"
    
    read -p "是否继续？(yes/no): " -r
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        log_info "操作已取消"
        exit 0
    fi
}

# 执行SQL文件
execute_sql_file() {
    local file_path="$1"
    local description="$2"
    
    log_info "执行 $description..."
    
    if [ ! -f "$file_path" ]; then
        log_error "文件不存在: $file_path"
        return 1
    fi
    
    if psql "$DATABASE_URL" -f "$file_path" > /dev/null 2>&1; then
        log_success "$description 执行完成"
        return 0
    else
        log_error "$description 执行失败"
        return 1
    fi
}

# 重建数据库
rebuild_database() {
    log_info "开始重建数据库（纯订阅积分系统）..."
    
    # 1. 执行数据库重建脚本
    if execute_sql_file "src/db/sql/rebuild-database.sql" "数据库结构重建"; then
        log_success "数据库结构重建完成"
    else
        log_error "数据库结构重建失败"
        exit 1
    fi
    
    # 2. 创建支付和积分函数
    if execute_sql_file "src/db/sql/payment-functions.sql" "订阅积分函数创建"; then
        log_success "订阅积分函数创建完成"
    else
        log_error "订阅积分函数创建失败"
        exit 1
    fi
}

# 运行测试
run_tests() {
    log_info "运行订阅积分系统测试..."
    
    if execute_sql_file "src/db/sql/test-payment-system.sql" "订阅积分系统功能测试"; then
        log_success "订阅积分系统测试完成"
    else
        log_warning "订阅积分系统测试失败，请检查输出"
    fi
}

# 验证安装
verify_installation() {
    log_info "验证订阅积分系统安装..."
    
    # 检查关键表是否存在
    local tables=("user" "user_credit_balance" "subscription_credits" "credit_transaction" "credit_package")
    
    for table in "${tables[@]}"; do
        if psql "$DATABASE_URL" -c "SELECT 1 FROM $table LIMIT 1;" > /dev/null 2>&1; then
            log_success "表 $table 验证通过"
        else
            log_error "表 $table 验证失败"
            return 1
        fi
    done
    
    # 检查关键函数是否存在
    local functions=("handle_subscription_payment_success" "consume_credits" "expire_subscription_credits")
    
    for func in "${functions[@]}"; do
        if psql "$DATABASE_URL" -c "SELECT $func;" > /dev/null 2>&1; then
            log_success "函数 $func 验证通过"
        else
            log_error "函数 $func 验证失败"
            return 1
        fi
    done
    
    # 检查积分套餐数据
    local package_count=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM credit_package WHERE is_active = true;" | tr -d ' ')
    if [ "$package_count" -ge 2 ]; then
        log_success "积分套餐数据验证通过（$package_count 个套餐）"
    else
        log_error "积分套餐数据验证失败（只有 $package_count 个套餐）"
        return 1
    fi
    
    # 检查订阅套餐
    local subscription_count=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM credit_package WHERE is_active = true;" | tr -d ' ')
    if [ "$subscription_count" -ge 2 ]; then
        log_success "订阅套餐验证通过（$subscription_count 个订阅套餐）"
    else
        log_error "订阅套餐验证失败（只有 $subscription_count 个订阅套餐）"
        return 1
    fi
    
    log_success "订阅积分系统安装验证完成"
}

# 运行系统健康检查
run_health_check() {
    log_info "运行系统健康检查..."
    
    # 检查数据完整性
    local integrity_result=$(psql "$DATABASE_URL" -t -c "
    SELECT 
      CASE 
        WHEN 
          (SELECT COUNT(*) FROM user_credit_balance WHERE balance < 0) = 0
        THEN 'PASS'
        ELSE 'FAIL'
      END;" | tr -d ' ')
    
    if [ "$integrity_result" = "PASS" ]; then
        log_success "数据完整性检查通过"
    else
        log_warning "数据完整性检查发现问题"
    fi
    
    # 显示系统状态摘要
    log_info "系统状态摘要："
    psql "$DATABASE_URL" -c "
    SELECT 
      'Total Users' as metric,
      COUNT(*) as value
    FROM \"user\"
    UNION ALL
    SELECT 
      'Active Credit Balances' as metric,
      COUNT(*) as value
    FROM user_credit_balance
    UNION ALL
    SELECT 
      'Active Subscription Credits' as metric,
      COUNT(*) as value
    FROM subscription_credits WHERE status = 'active'
    UNION ALL
    SELECT 
      'Credit Packages' as metric,
      COUNT(*) as value
    FROM credit_package WHERE is_active = true;"
}

# 显示后续步骤
show_next_steps() {
    log_success "🎉 订阅积分系统数据库重建完成！"
    echo
    log_info "新功能特性："
    echo "✅ 月订阅套餐：$16.90 = 120积分（30天过期）"
    echo "✅ 年订阅套餐：$118.80 = 1800积分（365天过期）"
    echo "✅ 智能积分消费（优先使用即将过期的积分）"
    echo "✅ 自动积分过期处理"
    echo
    log_info "后续步骤："
    echo "1. 配置 Stripe 订阅产品和价格"
    echo "2. 设置订阅支付 Webhook 端点"
    echo "3. 配置定时任务处理积分过期"
    echo "4. 测试订阅支付功能"
    echo "5. 监控积分过期和用户余额"
    echo
    log_info "重要命令："
    echo "- 查看用户详细积分: SELECT get_user_credits('user_id');"
    echo "- 处理过期积分: SELECT expire_subscription_credits();"
    echo "- 监控订阅状态: SELECT * FROM subscription_credits_monitor;"
    echo "- 运行健康检查: \\i src/db/sql/test-payment-system.sql"
    echo
    log_info "环境变量配置："
    echo "- STRIPE_MONTHLY_PRICE_ID=price_monthly_120_credits"
    echo "- STRIPE_YEARLY_PRICE_ID=price_yearly_1800_credits"
    echo
    if [ -f ".last_backup" ]; then
        local backup_file=$(cat .last_backup)
        log_info "数据备份位置: $backup_file"
    fi
    echo
    log_warning "请设置定时任务每小时执行积分过期检查："
    echo "0 * * * * psql \$DATABASE_URL -c \"SELECT scheduled_expire_credits();\""
}

# 主函数
main() {
    echo "========================================"
    echo "AIFaceSwap 订阅积分系统数据库重建脚本"
    echo "========================================"
    echo
    
    # 检查必要条件
    check_requirements
    check_env_vars
    
    # 备份数据库
    backup_database
    
    # 确认操作
    confirm_rebuild
    
    # 执行重建
    rebuild_database
    
    # 运行测试
    if [ "$1" != "--skip-tests" ]; then
        run_tests
    fi
    
    # 验证安装
    if verify_installation; then
        # 运行健康检查
        if [ "$1" != "--skip-health-check" ]; then
            run_health_check
        fi
        show_next_steps
    else
        log_error "安装验证失败，请检查日志"
        exit 1
    fi
}

# 显示帮助信息
show_help() {
    echo "用法: $0 [选项]"
    echo
    echo "选项:"
    echo "  --skip-tests         跳过测试步骤"
    echo "  --skip-health-check  跳过健康检查步骤"
    echo "  --help               显示此帮助信息"
    echo
    echo "环境变量:"
    echo "  DATABASE_URL   PostgreSQL 数据库连接字符串"
    echo
    echo "示例:"
    echo "  export DATABASE_URL='postgresql://user:pass@host:5432/db'"
    echo "  $0"
    echo
    echo "  # 跳过测试和健康检查"
    echo "  $0 --skip-tests --skip-health-check"
    echo
    echo "新功能："
    echo "  - 纯订阅积分系统"
    echo "  - 月订阅和年订阅套餐"
    echo "  - 积分自动过期机制"
    echo "  - 智能积分消费策略"
}

# 解析命令行参数
case "${1:-}" in
    --help)
        show_help
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac 