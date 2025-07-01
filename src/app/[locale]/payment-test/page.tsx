"use client";

import { useState } from "react";
import Script from "next/script";

import { PaymentModal } from "~/components/payment/payment-modal";
import { SubscriptionModal } from "~/components/payment/subscription-modal";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Button } from "~/components/ui/button";

// 订阅计划配置
const subscriptionPlans = [
  {
    features: ["基础功能", "5个项目", "邮件支持"],
    id: "basic",
    interval: "月",
    name: "基础版",
    price: "$9.99",
    priceId: "price_basic_monthly", // 这里应该是真实的 Stripe Price ID
  },
  {
    features: ["所有基础功能", "无限项目", "优先支持", "高级分析"],
    id: "pro",
    interval: "月",
    name: "专业版",
    price: "$19.99",
    priceId: "price_pro_monthly", // 这里应该是真实的 Stripe Price ID
  },
  {
    features: ["所有专业功能", "团队协作", "API访问", "专属客服"],
    id: "enterprise",
    interval: "月",
    name: "企业版",
    price: "$49.99",
    priceId: "price_enterprise_monthly", // 这里应该是真实的 Stripe Price ID
  },
];

export default function PaymentTestPage() {
  const [amount, setAmount] = useState(10);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"" | "error" | "success">("");

  // 新增状态用于积分测试
  const [testUserId, setTestUserId] = useState("");
  const [testAmount, setTestAmount] = useState(1690);
  const [testType, setTestType] = useState<"monthly" | "yearly" | "custom">(
    "monthly"
  );
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  const handlePaymentSuccess = () => {
    setMessage("一次性支付成功！");
    setMessageType("success");
    setTimeout(() => {
      setMessage("");
      setMessageType("");
    }, 5000);
  };

  const handlePaymentError = (error: string) => {
    setMessage(`支付失败: ${error}`);
    setMessageType("error");
    setTimeout(() => {
      setMessage("");
      setMessageType("");
    }, 5000);
  };

  const handleSubscriptionSuccess = (subscriptionId: string) => {
    setMessage(`订阅创建成功！订阅ID: ${subscriptionId}`);
    setMessageType("success");
    setTimeout(() => {
      setMessage("");
      setMessageType("");
    }, 5000);
  };

  const handleSubscriptionError = (error: string) => {
    setMessage(`订阅失败: ${error}`);
    setMessageType("error");
    setTimeout(() => {
      setMessage("");
      setMessageType("");
    }, 5000);
  };

  // 新增积分测试处理函数
  const handleCreditTest = async () => {
    if (!testUserId.trim()) {
      setMessage("请输入用户ID");
      setMessageType("error");
      return;
    }

    setTestLoading(true);
    setTestResult(null);

    try {
      const response = await fetch("/api/admin/test-subscription-credits", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: testUserId.trim(),
          amount: testType === "custom" ? testAmount : undefined,
          testType,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setTestResult(result);
        setMessage(
          `积分测试成功！为用户添加了 ${result.testDetails.expectedCredits} 积分`
        );
        setMessageType("success");
      } else {
        setMessage(`积分测试失败: ${result.error}`);
        setMessageType("error");
      }
    } catch (error) {
      setMessage(
        `积分测试失败: ${error instanceof Error ? error.message : "未知错误"}`
      );
      setMessageType("error");
    } finally {
      setTestLoading(false);
      setTimeout(() => {
        setMessage("");
        setMessageType("");
      }, 8000);
    }
  };

  const getUserCredits = async () => {
    if (!testUserId.trim()) {
      setMessage("请输入用户ID");
      setMessageType("error");
      return;
    }

    try {
      const response = await fetch(
        `/api/admin/test-subscription-credits?userId=${testUserId.trim()}`
      );
      const result = await response.json();

      if (result.success) {
        setTestResult(result);
        setMessage("成功获取用户积分信息");
        setMessageType("success");
      } else {
        setMessage(`获取用户信息失败: ${result.error}`);
        setMessageType("error");
      }
    } catch (error) {
      setMessage(
        `获取用户信息失败: ${
          error instanceof Error ? error.message : "未知错误"
        }`
      );
      setMessageType("error");
    }
  };

  return (
    <>
      {/* Load Stripe Pricing Table Script */}
      <Script
        src="https://js.stripe.com/v3/pricing-table.js"
        strategy="afterInteractive"
      />

      <div className="container mx-auto max-w-4xl py-8">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-foreground">
            Stripe 支付测试
          </h1>
          <p className="mt-2 text-muted-foreground">
            使用测试卡号进行支付测试 - 支持一次性支付和订阅支付
          </p>
        </div>

        {/* 全局消息显示 */}
        {message && (
          <div className="mb-6">
            <div
              className={`
                rounded-md p-4 text-sm
                ${
                  messageType === "success"
                    ? `
                    bg-green-50 text-green-700
                    dark:bg-green-900/20 dark:text-green-400
                  `
                    : `
                    bg-red-50 text-red-700
                    dark:bg-red-900/20 dark:text-red-400
                  `
                }
              `}
            >
              {message}
            </div>
          </div>
        )}

        <div className="space-y-8">
          {/* 测试卡信息 */}
          <Card>
            <CardHeader>
              <CardTitle>测试卡信息</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div
                className={`
                grid grid-cols-1 gap-2 text-sm
                md:grid-cols-2
              `}
              >
                <div>
                  <strong>成功支付:</strong> 4242 4242 4242 4242
                </div>
                <div>
                  <strong>需要验证:</strong> 4000 0025 0000 3155
                </div>
                <div>
                  <strong>被拒绝:</strong> 4000 0000 0000 0002
                </div>
                <div>
                  <strong>过期日期:</strong> 任何未来日期
                </div>
                <div>
                  <strong>CVC:</strong> 任何3位数字
                </div>
                <div>
                  <strong>邮编:</strong> 任何5位数字
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Stripe 官方定价表测试 */}
          <Card>
            <CardHeader>
              <CardTitle>Stripe 官方定价表测试</CardTitle>
              <CardDescription>
                使用 Stripe 官方定价表组件进行支付测试
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border p-4">
                <stripe-pricing-table
                  pricing-table-id="prctbl_1RfcfrP9YNEyAXtbdnk9VKvw"
                  publishable-key="pk_test_51RR7rMP9YNEyAXtb8NSf2BNWkL0qepSqdJKuTNMNrSJoGOVoRjeuqTh2HoRDUCaMiuuhAaoB3WkjUNNHczHmezrA00BXOxxszr"
                ></stripe-pricing-table>
              </div>
              <div className="mt-4 text-sm text-muted-foreground">
                <p>
                  📝 <strong>说明:</strong> 这是 Stripe
                  官方定价表组件，可以直接处理支付流程
                </p>
                <p>
                  🔧 <strong>配置:</strong> 使用你提供的定价表ID和测试公钥
                </p>
              </div>
            </CardContent>
          </Card>

          {/* 订阅积分系统测试 */}
          <Card>
            <CardHeader>
              <CardTitle>订阅积分系统测试</CardTitle>
              <CardDescription>
                测试订阅支付成功后的积分添加逻辑（仅开发环境）
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="testUserId">用户ID</Label>
                  <Input
                    id="testUserId"
                    placeholder="输入用户ID进行测试"
                    value={testUserId}
                    onChange={(e) => setTestUserId(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="testType">测试类型</Label>
                  <select
                    id="testType"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={testType}
                    onChange={(e) => setTestType(e.target.value as any)}
                  >
                    <option value="monthly">月付订阅 (120积分)</option>
                    <option value="yearly">年付订阅 (1800积分)</option>
                    <option value="custom">自定义价格</option>
                  </select>
                </div>
              </div>

              {testType === "custom" && (
                <div className="space-y-2">
                  <Label htmlFor="testAmount">自定义价格 (美分)</Label>
                  <Input
                    id="testAmount"
                    type="number"
                    placeholder="输入价格（美分）"
                    value={testAmount}
                    onChange={(e) => setTestAmount(Number(e.target.value))}
                  />
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={handleCreditTest}
                  disabled={testLoading || !testUserId.trim()}
                  className="flex-1"
                >
                  {testLoading ? "测试中..." : "测试积分添加"}
                </Button>

                <Button
                  onClick={getUserCredits}
                  disabled={!testUserId.trim()}
                  variant="outline"
                  className="flex-1"
                >
                  查看用户积分
                </Button>
              </div>

              {/* 测试结果显示 */}
              {testResult && (
                <div className="mt-4 rounded-lg border p-4 bg-muted/50">
                  <h4 className="font-semibold mb-2">测试结果</h4>
                  <div className="space-y-2 text-sm">
                    {testResult.testDetails && (
                      <div>
                        <strong>测试详情:</strong>
                        <div className="ml-4">
                          <div>用户: {testResult.testDetails.userEmail}</div>
                          <div>类型: {testResult.testDetails.testType}</div>
                          <div>
                            价格: {testResult.testDetails.testAmount} 美分
                          </div>
                          <div>
                            预期积分: {testResult.testDetails.expectedCredits}
                          </div>
                        </div>
                      </div>
                    )}

                    {testResult.balanceChanges && (
                      <div>
                        <strong>积分变化:</strong>
                        <div className="ml-4">
                          <div>
                            之前: {testResult.balanceChanges.before} 积分
                          </div>
                          <div>
                            之后: {testResult.balanceChanges.after} 积分
                          </div>
                          <div>
                            增加: +{testResult.balanceChanges.added} 积分
                          </div>
                        </div>
                      </div>
                    )}

                    {testResult.balance && (
                      <div>
                        <strong>当前积分状态:</strong>
                        <div className="ml-4">
                          <div>当前余额: {testResult.balance.current} 积分</div>
                          <div>
                            总充值: {testResult.balance.totalRecharged} 积分
                          </div>
                          <div>
                            总消费: {testResult.balance.totalConsumed} 积分
                          </div>
                        </div>
                      </div>
                    )}

                    {testResult.transactionDetails && (
                      <div>
                        <strong>交易ID:</strong>{" "}
                        {testResult.transactionDetails.transactionId}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 一次性支付测试 */}
          <Card>
            <CardHeader>
              <CardTitle>一次性支付测试</CardTitle>
              <CardDescription>
                使用自定义支付组件进行一次性支付测试
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="amount">金额 (USD)</Label>
                <Input
                  id="amount"
                  min="0.5"
                  onChange={(e) => setAmount(Number(e.target.value))}
                  placeholder="输入金额"
                  step="0.01"
                  type="number"
                  value={amount}
                />
              </div>

              <PaymentModal
                amount={amount}
                description={`测试支付 - $${amount}`}
                onError={handlePaymentError}
                onSuccess={handlePaymentSuccess}
                triggerText={`支付 $${amount}`}
              />
            </CardContent>
          </Card>

          {/* 订阅支付测试 */}
          <Card>
            <CardHeader>
              <CardTitle>订阅支付测试</CardTitle>
              <CardDescription>
                选择一个订阅计划进行测试（使用测试价格ID）
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className={`
                grid gap-4
                md:grid-cols-3
              `}
              >
                {subscriptionPlans.map((plan) => (
                  <div
                    className={`
                      space-y-4 rounded-lg border p-4 transition-shadow
                      hover:shadow-md
                    `}
                    key={plan.id}
                  >
                    <div className="text-center">
                      <h3 className="text-lg font-semibold">{plan.name}</h3>
                      <div className="mt-2 text-2xl font-bold text-primary">
                        {plan.price}
                        <span
                          className={`
                          text-sm font-normal text-muted-foreground
                        `}
                        >
                          /{plan.interval}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {plan.features.map((feature, index) => (
                        <div
                          className="flex items-center gap-2 text-sm"
                          key={index}
                        >
                          <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                          {feature}
                        </div>
                      ))}
                    </div>

                    <SubscriptionModal
                      interval={plan.interval}
                      onError={handleSubscriptionError}
                      onSuccess={handleSubscriptionSuccess}
                      planName={plan.name}
                      price={plan.price}
                      priceId={plan.priceId}
                      triggerText={`订阅 ${plan.name}`}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
