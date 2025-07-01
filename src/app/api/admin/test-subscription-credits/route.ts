import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { addBonusCreditsWithTransaction } from "~/api/credits/credit-service";
import { db } from "~/db";
import { userTable, userCreditBalanceTable, creditTransactionTable } from "~/db/schema";

/**
 * 测试订阅积分添加逻辑的API端点
 * 只在开发和测试环境中使用
 */
export async function POST(request: NextRequest) {
  try {
    // 只在开发环境允许
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "此API仅在开发环境可用", success: false },
        { status: 403 }
      );
    }

    const { userId, amount, testType } = await request.json() as {
      userId: string;
      amount: number;
      testType: "monthly" | "yearly" | "custom";
    };

    if (!userId) {
      return NextResponse.json(
        { error: "userId 是必需的", success: false },
        { status: 400 }
      );
    }

    // 验证用户是否存在
    const user = await db.query.userTable.findFirst({
      where: eq(userTable.id, userId),
    });

    if (!user) {
      return NextResponse.json(
        { error: "用户不存在", success: false },
        { status: 400 }
      );
    }

    // 获取用户当前积分余额
    const currentBalance = await db.query.userCreditBalanceTable.findFirst({
      where: eq(userCreditBalanceTable.userId, userId),
    });

    // 确定测试参数
    let testAmount: number;
    let expectedCredits: number;
    let description: string;

    switch (testType) {
      case "monthly":
        testAmount = 1690; // 月付价格
        expectedCredits = 120;
        description = "测试月付订阅积分奖励";
        break;
      case "yearly":
        testAmount = 990; // 年付价格
        expectedCredits = 1800;
        description = "测试年付订阅积分奖励";
        break;
      case "custom":
        testAmount = amount || 1690;
        // 使用相同的逻辑来确定积分
        if (testAmount >= 1600 && testAmount <= 1800) {
          expectedCredits = 120;
        } else if (testAmount >= 900 && testAmount <= 1100) {
          expectedCredits = 1800;
        } else if (testAmount >= 1200) {
          expectedCredits = 120;
        } else if (testAmount >= 500) {
          expectedCredits = 1800;
        } else {
          expectedCredits = 120; // 默认
        }
        description = `测试自定义价格(${testAmount})订阅积分奖励`;
        break;
      default:
        return NextResponse.json(
          { error: "无效的测试类型", success: false },
          { status: 400 }
        );
    }

    console.log(`[测试] 开始测试订阅积分添加:`, {
      userId,
      testType,
      testAmount,
      expectedCredits,
      currentBalance: currentBalance?.balance || 0,
    });

    // 模拟订阅积分奖励
    const result = await addBonusCreditsWithTransaction(
      userId,
      expectedCredits,
      description,
      {
        testSubscriptionId: `test_sub_${Date.now()}`,
        testPriceId: `test_price_${testType}`,
        testAmount,
        type: "subscription_bonus_test",
        webhookEventType: "test.subscription.created",
        originalPrice: testAmount,
        testMode: true,
      }
    );

    // 获取更新后的积分余额
    const newBalance = await db.query.userCreditBalanceTable.findFirst({
      where: eq(userCreditBalanceTable.userId, userId),
    });

    const response = {
      success: true,
      message: "订阅积分测试完成",
      testDetails: {
        userId,
        userEmail: user.email,
        testType,
        testAmount,
        expectedCredits,
      },
      balanceChanges: {
        before: currentBalance?.balance || 0,
        after: newBalance?.balance || 0,
        added: expectedCredits,
      },
      transactionDetails: {
        transactionId: result.transactionId,
        success: result.success,
      },
      timestamp: new Date().toISOString(),
    };

    console.log(`[测试] 订阅积分测试完成:`, response);

    return NextResponse.json(response);

  } catch (error) {
    console.error("[测试] 订阅积分测试失败:", error);
    
    return NextResponse.json(
      {
        success: false,
        error: "订阅积分测试失败",
        details: error instanceof Error ? error.message : "未知错误",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * 获取订阅积分测试状态
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "userId 参数是必需的", success: false },
        { status: 400 }
      );
    }

    // 获取用户信息
    const user = await db.query.userTable.findFirst({
      where: eq(userTable.id, userId),
    });

    if (!user) {
      return NextResponse.json(
        { error: "用户不存在", success: false },
        { status: 400 }
      );
    }

    // 获取用户积分余额
    const balance = await db.query.userCreditBalanceTable.findFirst({
      where: eq(userCreditBalanceTable.userId, userId),
    });

    // 获取最近的积分交易记录
    const recentTransactions = await db.query.creditTransactionTable.findMany({
      where: eq(creditTransactionTable.userId, userId),
      orderBy: (table, { desc }) => [desc(table.createdAt)],
      limit: 10,
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      balance: {
        current: balance?.balance || 0,
        totalRecharged: balance?.totalRecharged || 0,
        totalConsumed: balance?.totalConsumed || 0,
      },
      recentTransactions: recentTransactions.map(tx => ({
        id: tx.id,
        type: tx.type,
        amount: tx.amount,
        description: tx.description,
        balanceAfter: tx.balanceAfter,
        createdAt: tx.createdAt,
        metadata: tx.metadata,
      })),
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error("[测试] 获取订阅积分状态失败:", error);
    
    return NextResponse.json(
      {
        success: false,
        error: "获取状态失败",
        details: error instanceof Error ? error.message : "未知错误",
      },
      { status: 500 }
    );
  }
} 