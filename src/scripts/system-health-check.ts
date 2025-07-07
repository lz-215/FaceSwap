// 系统健康检查 - 简化版
// 使用 Supabase HTTP API

import { createClient } from "~/lib/supabase/server";

interface HealthCheckResult {
  category: string;
  status: "PASS" | "WARN" | "FAIL";
  message: string;
  details?: any;
}

interface SystemHealthReport {
  timestamp: Date;
  overallStatus: "HEALTHY" | "WARNING" | "CRITICAL";
  results: HealthCheckResult[];
  summary: {
    total: number;
    passed: number;
    warnings: number;
    failures: number;
  };
}

export async function runSystemHealthCheck(): Promise<SystemHealthReport> {
  console.log("🔍 开始系统健康检查...");
  const startTime = Date.now();

  const results: HealthCheckResult[] = [];

  // 基本的数据库连接检查
  results.push(...(await checkDatabaseConnection()));

  // 计算汇总信息
  const summary = {
    total: results.length,
    passed: results.filter((r) => r.status === "PASS").length,
    warnings: results.filter((r) => r.status === "WARN").length,
    failures: results.filter((r) => r.status === "FAIL").length,
  };

  const overallStatus = 
    summary.failures > 0 ? "CRITICAL" : 
    summary.warnings > 0 ? "WARNING" : "HEALTHY";

  const report: SystemHealthReport = {
    timestamp: new Date(),
    overallStatus,
    results,
    summary,
  };

  const endTime = Date.now();
  console.log(`✅ 健康检查完成，耗时 ${endTime - startTime}ms`);

  return report;
}

async function checkDatabaseConnection(): Promise<HealthCheckResult[]> {
  const results: HealthCheckResult[] = [];
  
  try {
    console.log("  🔌 检查数据库连接...");
    const supabase = await createClient();
    
    // 测试数据库连接
    const { data, error } = await supabase
      .from("user_profiles")
      .select("count")
      .limit(1);
    
    if (error) {
      results.push({
        category: "DATABASE",
        status: "FAIL",
        message: "数据库连接失败",
        details: error.message,
      });
    } else {
      results.push({
        category: "DATABASE",
        status: "PASS",
        message: "数据库连接正常",
      });
    }
  } catch (error) {
    results.push({
      category: "DATABASE",
      status: "FAIL",
      message: "数据库连接检查失败",
      details: error instanceof Error ? error.message : error,
    });
  }
  
  return results;
}

function printHealthReport(report: SystemHealthReport) {
  console.log("\n" + "=".repeat(60));
  console.log("📋 系统健康检查报告");
  console.log("=".repeat(60));
  console.log(`⏰ 检查时间: ${report.timestamp.toISOString()}`);
  console.log(`🎯 总体状态: ${getStatusEmoji(report.overallStatus)} ${report.overallStatus}`);
  console.log(`📊 汇总: ${report.summary.total} 项检查 (✅ ${report.summary.passed}, ⚠️ ${report.summary.warnings}, ❌ ${report.summary.failures})`);
  console.log("");

  // 按状态分组显示结果
  const failedChecks = report.results.filter((r) => r.status === "FAIL");
  const warningChecks = report.results.filter((r) => r.status === "WARN");
  const passedChecks = report.results.filter((r) => r.status === "PASS");

  if (failedChecks.length > 0) {
    console.log("❌ 失败的检查:");
    failedChecks.forEach((result) => {
      console.log(`   • ${result.category}: ${result.message}`);
      if (result.details) {
        console.log(`     详情: ${JSON.stringify(result.details, null, 2)}`);
      }
    });
    console.log("");
  }

  if (warningChecks.length > 0) {
    console.log("⚠️ 警告的检查:");
    warningChecks.forEach((result) => {
      console.log(`   • ${result.category}: ${result.message}`);
    });
    console.log("");
  }

  if (passedChecks.length > 0) {
    console.log("✅ 通过的检查:");
    passedChecks.forEach((result) => {
      console.log(`   • ${result.category}: ${result.message}`);
    });
  }

  console.log("=".repeat(60));
}

function getStatusEmoji(status: string): string {
  switch (status) {
    case "HEALTHY":
    case "PASS":
      return "✅";
    case "WARNING":
    case "WARN":
      return "⚠️";
    case "CRITICAL":
    case "FAIL":
      return "❌";
    default:
      return "❓";
  }
}

// 系统健康检查函数
export async function systemHealthCheck() {
  try {
    const supabase = await createClient();
    
    // 测试数据库连接
    const { data, error } = await supabase
      .from("user_profiles")
      .select("count")
      .limit(1);
    
    if (error) {
      console.error("数据库连接失败:", error);
      return false;
    }
    
    console.log("系统健康检查通过");
    return true;
  } catch (error) {
    console.error("系统健康检查失败:", error);
    return false;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  runSystemHealthCheck()
    .then((report) => {
      printHealthReport(report);
      process.exit(report.overallStatus === "CRITICAL" ? 1 : 0);
    })
    .catch((error) => {
      console.error("健康检查运行失败:", error);
      process.exit(1);
    });
} 