#!/bin/bash

# =================================================================
# 设置支付系统监控定时任务
# =================================================================

# 给监控脚本添加执行权限
chmod +x scripts/monitor-payments.sh

# 添加到crontab（每15分钟检查一次）
echo "设置定时任务..."

(crontab -l 2>/dev/null; echo "*/15 * * * * cd $(pwd) && ./scripts/monitor-payments.sh >> logs/payment-monitor.log 2>&1") | crontab -

echo "定时任务已设置完成"
echo "监控日志将保存在: logs/payment-monitor.log"

# 创建日志目录
mkdir -p logs

echo "设置完成！监控脚本将每15分钟运行一次。" 