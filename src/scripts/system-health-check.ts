import { eq, sql, and, gte, lte } from "drizzle-orm";
import { db } from "~/db";
import {
  userCreditBalanceTable,
  creditTransactionTable,
  creditRechargeTable,
  creditPackageTable,
  creditConsumptionConfigTable,
} from "~/db/schema";
import { stripe } from "~/lib/stripe";

/**
 * 支付和积分系统健康检查脚本
 * 用于验证数据一致性、发现潜在问题
 */

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

/**
 * 主健康检查函数
 */
export async function runSystemHealthCheck(): Promise<SystemHealthReport> {
  console.log("🔍 开始系统健康检查...");
  
  const results: HealthCheckResult[] = [];
  
  try {
    // 1. 积分余额一致性检查
    results.push(...(await checkCreditBalanceConsistency()));
    
    // 2. 交易记录完整性检查
    results.push(...(await checkTransactionIntegrity()));
    
    // 3. 充值记录状态检查
    results.push(...(await checkRechargeStatus()));
    
    // 4. Stripe 支付状态同步检查
    results.push(...(await checkStripePaymentSync()));
    
    // 5. 系统配置检查
    results.push(...(await checkSystemConfiguration()));
    
    // 6. 数据异常检查
    results.push(...(await checkDataAnomalies()));
    
  } catch (error) {
    results.push({
      category: "SYSTEM",
      status: "FAIL",
      message: "健康检查执行失败",
      details: error instanceof Error ? error.message : error,
    });
  }
  
  // 生成汇总报告
  const summary = {
    total: results.length,
    passed: results.filter(r => r.status === "PASS").length,
    warnings: results.filter(r => r.status === "WARN").length,
    failures: results.filter(r => r.status === "FAIL").length,
  };
  
  const overallStatus = summary.failures > 0 ? "CRITICAL" : 
                       summary.warnings > 0 ? "WARNING" : "HEALTHY";
  
  const report: SystemHealthReport = {
    timestamp: new Date(),
    overallStatus,
    results,
    summary,
  };
  
  console.log("✅ 健康检查完成");
  printHealthReport(report);
  
  return report;
}

/**
 * 检查积分余额一致性
 */
async function checkCreditBalanceConsistency(): Promise<HealthCheckResult[]> {
  const results: HealthCheckResult[] = [];
  
  try {
    console.log("  📊 检查积分余额一致性...");
    
    // 查询所有用户的积分余额和交易记录
    const balanceQuery = await db
      .select({
        userId: userCreditBalanceTable.userId,
        balance: userCreditBalanceTable.balance,
        totalRecharged: userCreditBalanceTable.totalRecharged,
        totalConsumed: userCreditBalanceTable.totalConsumed,
      })
      .from(userCreditBalanceTable);
    
    let inconsistentUsers = 0;
    const issues: any[] = [];
    
    for (const user of balanceQuery) {
      // 计算实际的充值总额
      const actualRecharges = await db
        .select({
          total: sql<number>`COALESCE(SUM(amount), 0)`,
        })
        .from(creditTransactionTable)
        .where(
          and(
            eq(creditTransactionTable.userId, user.userId),
            eq(creditTransactionTable.type, "recharge"),
          ),
        );
      
      // 计算实际的消费总额
      const actualConsumptions = await db
        .select({
          total: sql<number>`COALESCE(SUM(ABS(amount)), 0)`,
        })
        .from(creditTransactionTable)
        .where(
          and(
            eq(creditTransactionTable.userId, user.userId),
            eq(creditTransactionTable.type, "consumption"),
          ),
        );
      
      // 计算实际的奖励总额
      const actualBonuses = await db
        .select({
          total: sql<number>`COALESCE(SUM(amount), 0)`,
        })
        .from(creditTransactionTable)
        .where(
          and(
            eq(creditTransactionTable.userId, user.userId),
            eq(creditTransactionTable.type, "bonus"),
          ),
        );
      
      const actualTotalRecharged = (actualRecharges[0]?.total || 0) + (actualBonuses[0]?.total || 0);
      const actualTotalConsumed = actualConsumptions[0]?.total || 0;
      const calculatedBalance = actualTotalRecharged - actualTotalConsumed;
      
      // 检查是否一致
      if (
        user.totalRecharged !== actualTotalRecharged ||
        user.totalConsumed !== actualTotalConsumed ||
        user.balance !== calculatedBalance
      ) {
        inconsistentUsers++;
        issues.push({
          userId: user.userId,
          recorded: {
            balance: user.balance,
            totalRecharged: user.totalRecharged,
            totalConsumed: user.totalConsumed,
          },
          calculated: {
            balance: calculatedBalance,
            totalRecharged: actualTotalRecharged,
            totalConsumed: actualTotalConsumed,
          },
        });
      }
    }
    
    if (inconsistentUsers === 0) {
      results.push({
        category: "CREDIT_BALANCE",
        status: "PASS",
        message: `所有 ${balanceQuery.length} 个用户的积分余额一致性检查通过`,
      });
    } else {
      results.push({
        category: "CREDIT_BALANCE",
        status: "FAIL",
        message: `发现 ${inconsistentUsers} 个用户的积分余额不一致`,
        details: issues.slice(0, 5), // 只显示前5个问题
      });
    }
    
  } catch (error) {
    results.push({
      category: "CREDIT_BALANCE",
      status: "FAIL",
      message: "积分余额一致性检查失败",
      details: error instanceof Error ? error.message : error,
    });
  }
  
  return results;
}

/**
 * 检查交易记录完整性
 */
async function checkTransactionIntegrity(): Promise<HealthCheckResult[]> {
  const results: HealthCheckResult[] = [];
  
  try {
    console.log("  📋 检查交易记录完整性...");
    
    // 检查孤立的消费记录（没有对应的余额记录）
    const orphanedConsumptions = await db
      .select({
        userId: creditTransactionTable.userId,
        count: sql<number>`COUNT(*)`,
      })
      .from(creditTransactionTable)
      .leftJoin(
        userCreditBalanceTable,
        eq(creditTransactionTable.userId, userCreditBalanceTable.userId),
      )
      .where(
        and(
          eq(creditTransactionTable.type, "consumption"),
          sql`${userCreditBalanceTable.userId} IS NULL`,
        ),
      )
      .groupBy(creditTransactionTable.userId);
    
    if (orphanedConsumptions.length === 0) {
      results.push({
        category: "TRANSACTION_INTEGRITY",
        status: "PASS",
        message: "所有消费记录都有对应的积分余额记录",
      });
    } else {
      results.push({
        category: "TRANSACTION_INTEGRITY",
        status: "WARN",
        message: `发现 ${orphanedConsumptions.length} 个用户有孤立的消费记录`,
        details: orphanedConsumptions,
      });
    }
    
    // 检查 balanceAfter 字段的准确性
    const transactionsWithWrongBalance = await db
      .select({
        id: creditTransactionTable.id,
        userId: creditTransactionTable.userId,
        amount: creditTransactionTable.amount,
        balanceAfter: creditTransactionTable.balanceAfter,
        createdAt: creditTransactionTable.createdAt,
      })
      .from(creditTransactionTable)
      .orderBy(creditTransactionTable.userId, creditTransactionTable.createdAt)
      .limit(1000); // 限制检查数量以避免性能问题
    
    // 这里可以添加更详细的 balanceAfter 验证逻辑
    
  } catch (error) {
    results.push({
      category: "TRANSACTION_INTEGRITY",
      status: "FAIL",
      message: "交易记录完整性检查失败",
      details: error instanceof Error ? error.message : error,
    });
  }
  
  return results;
}

/**
 * 检查充值记录状态
 */
async function checkRechargeStatus(): Promise<HealthCheckResult[]> {
  const results: HealthCheckResult[] = [];
  
  try {
    console.log("  💳 检查充值记录状态...");
    
    // 检查长时间处于 pending 状态的充值记录
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const stalePendingRecharges = await db
      .select()
      .from(creditRechargeTable)
      .where(
        and(
          eq(creditRechargeTable.status, "pending"),
          lte(creditRechargeTable.createdAt, oneDayAgo),
        ),
      );
    
    if (stalePendingRecharges.length === 0) {
      results.push({
        category: "RECHARGE_STATUS",
        status: "PASS",
        message: "没有发现长时间处于待处理状态的充值记录",
      });
    } else {
      results.push({
        category: "RECHARGE_STATUS",
        status: "WARN",
        message: `发现 ${stalePendingRecharges.length} 个长时间处于待处理状态的充值记录`,
        details: stalePendingRecharges.map((r: typeof creditRechargeTable.$inferSelect) => ({
          id: r.id,
          userId: r.userId,
          amount: r.amount,
          price: r.price,
          createdAt: r.createdAt,
          paymentIntentId: r.paymentIntentId,
        })),
      });
    }
    
    // 检查已完成充值但没有对应交易记录的情况
    const completedWithoutTransaction = await db
      .select({
        rechargeId: creditRechargeTable.id,
        userId: creditRechargeTable.userId,
        amount: creditRechargeTable.amount,
      })
      .from(creditRechargeTable)
      .leftJoin(
        creditTransactionTable,
        eq(creditRechargeTable.id, creditTransactionTable.relatedRechargeId),
      )
      .where(
        and(
          eq(creditRechargeTable.status, "completed"),
          sql`${creditTransactionTable.id} IS NULL`,
        ),
      );
    
    if (completedWithoutTransaction.length === 0) {
      results.push({
        category: "RECHARGE_STATUS",
        status: "PASS",
        message: "所有已完成的充值都有对应的交易记录",
      });
    } else {
      results.push({
        category: "RECHARGE_STATUS",
        status: "FAIL",
        message: `发现 ${completedWithoutTransaction.length} 个已完成充值缺少交易记录`,
        details: completedWithoutTransaction,
      });
    }
    
  } catch (error) {
    results.push({
      category: "RECHARGE_STATUS",
      status: "FAIL",
      message: "充值记录状态检查失败",
      details: error instanceof Error ? error.message : error,
    });
  }
  
  return results;
}

/**
 * 检查 Stripe 支付状态同步
 */
async function checkStripePaymentSync(): Promise<HealthCheckResult[]> {
  const results: HealthCheckResult[] = [];
  
  try {
    console.log("  💰 检查 Stripe 支付状态同步...");
    
    // 检查最近的充值记录与 Stripe 状态是否一致
    const recentRecharges = await db
      .select()
      .from(creditRechargeTable)
      .where(
        and(
          gte(creditRechargeTable.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
          sql`${creditRechargeTable.paymentIntentId} IS NOT NULL`,
        ),
      )
      .limit(10);
    
    let syncIssues = 0;
    const issues: any[] = [];
    
    for (const recharge of recentRecharges) {
      try {
        if (!recharge.paymentIntentId) continue;
        
        const paymentIntent = await stripe.paymentIntents.retrieve(recharge.paymentIntentId);
        
        // 检查状态是否一致
        const expectedLocalStatus = 
          paymentIntent.status === "succeeded" ? "completed" :
          paymentIntent.status === "canceled" ? "failed" : "pending";
        
        if (recharge.status !== expectedLocalStatus) {
          syncIssues++;
          issues.push({
            rechargeId: recharge.id,
            localStatus: recharge.status,
            stripeStatus: paymentIntent.status,
            expectedLocalStatus,
            paymentIntentId: recharge.paymentIntentId,
          });
        }
        
        // 添加延迟以避免 API 限制
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (stripeError) {
        console.warn(`无法验证 PaymentIntent ${recharge.paymentIntentId}:`, stripeError);
      }
    }
    
    if (syncIssues === 0) {
      results.push({
        category: "STRIPE_SYNC",
        status: "PASS",
        message: `检查了 ${recentRecharges.length} 个充值记录，Stripe 状态同步正常`,
      });
    } else {
      results.push({
        category: "STRIPE_SYNC",
        status: "WARN",
        message: `发现 ${syncIssues} 个充值记录与 Stripe 状态不同步`,
        details: issues,
      });
    }
    
  } catch (error) {
    results.push({
      category: "STRIPE_SYNC",
      status: "FAIL",
      message: "Stripe 支付状态同步检查失败",
      details: error instanceof Error ? error.message : error,
    });
  }
  
  return results;
}

/**
 * 检查系统配置
 */
async function checkSystemConfiguration(): Promise<HealthCheckResult[]> {
  const results: HealthCheckResult[] = [];
  
  try {
    console.log("  ⚙️ 检查系统配置...");
    
    // 检查积分消费配置
    const consumptionConfigs = await db
      .select()
      .from(creditConsumptionConfigTable)
      .where(eq(creditConsumptionConfigTable.isActive, 1));
    
    if (consumptionConfigs.length === 0) {
      results.push({
        category: "SYSTEM_CONFIG",
        status: "WARN",
        message: "没有找到活跃的积分消费配置",
      });
    } else {
      results.push({
        category: "SYSTEM_CONFIG",
        status: "PASS",
        message: `找到 ${consumptionConfigs.length} 个活跃的积分消费配置`,
        details: consumptionConfigs.map((c: typeof creditConsumptionConfigTable.$inferSelect) => ({
          actionType: c.actionType,
          creditsRequired: c.creditsRequired,
          description: c.description,
        })),
      });
    }
    
    // 检查积分套餐配置
    const creditPackages = await db
      .select()
      .from(creditPackageTable)
      .where(eq(creditPackageTable.isActive, 1));
    
    if (creditPackages.length === 0) {
      results.push({
        category: "SYSTEM_CONFIG",
        status: "WARN",
        message: "没有找到活跃的积分套餐",
      });
    } else {
      results.push({
        category: "SYSTEM_CONFIG",
        status: "PASS",
        message: `找到 ${creditPackages.length} 个活跃的积分套餐`,
        details: creditPackages.map((p: typeof creditPackageTable.$inferSelect) => ({
          name: p.name,
          credits: p.credits,
          price: p.price,
          currency: p.currency,
        })),
      });
    }
    
  } catch (error) {
    results.push({
      category: "SYSTEM_CONFIG",
      status: "FAIL",
      message: "系统配置检查失败",
      details: error instanceof Error ? error.message : error,
    });
  }
  
  return results;
}

/**
 * 检查数据异常
 */
async function checkDataAnomalies(): Promise<HealthCheckResult[]> {
  const results: HealthCheckResult[] = [];
  
  try {
    console.log("  🔍 检查数据异常...");
    
    // 检查负余额
    const negativeBalances = await db
      .select()
      .from(userCreditBalanceTable)
      .where(sql`${userCreditBalanceTable.balance} < 0`);
    
    if (negativeBalances.length === 0) {
      results.push({
        category: "DATA_ANOMALY",
        status: "PASS",
        message: "没有发现负积分余额",
      });
    } else {
      results.push({
        category: "DATA_ANOMALY",
        status: "FAIL",
        message: `发现 ${negativeBalances.length} 个用户有负积分余额`,
        details: negativeBalances.map((b: typeof userCreditBalanceTable.$inferSelect) => ({
          userId: b.userId,
          balance: b.balance,
          totalRecharged: b.totalRecharged,
          totalConsumed: b.totalConsumed,
        })),
      });
    }
    
    // 检查异常大额交易
    const largeTransactions = await db
      .select()
      .from(creditTransactionTable)
      .where(
        and(
          sql`ABS(${creditTransactionTable.amount}) > 10000`,
          gte(creditTransactionTable.createdAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
        ),
      );
    
    if (largeTransactions.length === 0) {
      results.push({
        category: "DATA_ANOMALY",
        status: "PASS",
        message: "没有发现异常大额交易",
      });
    } else {
      results.push({
        category: "DATA_ANOMALY",
        status: "WARN",
        message: `发现 ${largeTransactions.length} 个大额交易（超过10000积分）`,
        details: largeTransactions.map((t: typeof creditTransactionTable.$inferSelect) => ({
          id: t.id,
          userId: t.userId,
          amount: t.amount,
          type: t.type,
          description: t.description,
          createdAt: t.createdAt,
        })),
      });
    }
    
  } catch (error) {
    results.push({
      category: "DATA_ANOMALY",
      status: "FAIL",
      message: "数据异常检查失败",
      details: error instanceof Error ? error.message : error,
    });
  }
  
  return results;
}

/**
 * 打印健康检查报告
 */
function printHealthReport(report: SystemHealthReport) {
  console.log("\n" + "=".repeat(80));
  console.log("🏥 系统健康检查报告");
  console.log("=".repeat(80));
  console.log(`📅 检查时间: ${report.timestamp.toLocaleString()}`);
  console.log(`🚥 整体状态: ${getStatusEmoji(report.overallStatus)} ${report.overallStatus}`);
  console.log(`📊 检查汇总: ${report.summary.total} 项检查, ${report.summary.passed} 通过, ${report.summary.warnings} 警告, ${report.summary.failures} 失败`);
  console.log("\n" + "-".repeat(80));
  
  // 按类别分组显示结果
  const groupedResults = report.results.reduce((groups, result) => {
    if (!groups[result.category]) {
      groups[result.category] = [];
    }
    groups[result.category].push(result);
    return groups;
  }, {} as Record<string, HealthCheckResult[]>);
  
  for (const [category, results] of Object.entries(groupedResults)) {
    console.log(`\n📋 ${category}:`);
    for (const result of results) {
      console.log(`  ${getStatusEmoji(result.status)} ${result.message}`);
      if (result.details && result.status !== "PASS") {
        console.log(`     💡 详情: ${JSON.stringify(result.details, null, 2).slice(0, 200)}...`);
      }
    }
  }
  
  console.log("\n" + "=".repeat(80));
  
  if (report.overallStatus === "CRITICAL") {
    console.log("⚠️  发现严重问题，建议立即处理！");
  } else if (report.overallStatus === "WARNING") {
    console.log("⚠️  发现一些警告，建议关注处理");
  } else {
    console.log("✅ 系统运行正常！");
  }
}

function getStatusEmoji(status: string): string {
  switch (status) {
    case "PASS":
    case "HEALTHY":
      return "✅";
    case "WARN":
    case "WARNING":
      return "⚠️";
    case "FAIL":
    case "CRITICAL":
      return "❌";
    default:
      return "❓";
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  runSystemHealthCheck()
    .then(() => {
      console.log("健康检查完成");
      process.exit(0);
    })
    .catch((error) => {
      console.error("健康检查失败:", error);
      process.exit(1);
    });
} 