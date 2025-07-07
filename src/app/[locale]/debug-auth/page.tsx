"use client";

import { Suspense } from "react";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Alert, AlertDescription } from "~/components/ui/alert";

interface ApiResponse {
  success: boolean;
  error?: string;
  message?: string;
  recommendation?: string;
  results?: Array<{
    step: string;
    status: string;
    message: string;
    data?: any;
  }>;
}

function DebugAuthContent() {
  const handleFixDatabase = async () => {
    try {
      const response = await fetch("/api/fix-auth-db", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const result = (await response.json()) as ApiResponse;

      if (result.success) {
        alert("数据库检查通过！认证系统应该正常工作了。");
        console.log("检查结果:", result);
      } else {
        alert(
          `数据库需要修复: ${result.message}\n\n${
            result.recommendation || "请查看控制台获取详细信息。"
          }`
        );
        console.error("修复错误:", result);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "未知错误";
      alert(`请求失败: ${errorMessage}`);
      console.error("请求错误:", error);
    }
  };

  const handleDownloadSQL = () => {
    window.open("/api/sql-script", "_blank");
  };

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-8">认证系统调试和修复</h1>

      <div className="space-y-6">
        <Alert className="border-red-200 bg-red-50">
          <AlertDescription className="text-red-800">
            <strong>重要：</strong> 如果你遇到登录失败的问题（"Database error
            saving new user" 或 "relation public.user does not
            exist"），这通常是因为数据库表结构不正确。
            这个工具可以帮助你诊断和修复问题。
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle>错误症状</CardTitle>
            <CardDescription>以下是常见的认证错误表现：</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <h4 className="font-semibold">浏览器中的错误:</h4>
              <code className="text-xs bg-gray-100 p-2 rounded block mt-1">
                #error=server_error&error_code=unexpected_failure&error_description=Database+error+saving+new+user
              </code>
            </div>
            <div>
              <h4 className="font-semibold">Supabase 日志中的错误:</h4>
              <code className="text-xs bg-gray-100 p-2 rounded block mt-1">
                ERROR: relation "public.user" does not exist (SQLSTATE 42P01)
              </code>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>第一步：快速检查</CardTitle>
            <CardDescription>
              点击下面的按钮检查数据库结构是否正确。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleFixDatabase} className="w-full">
              🔍 检查数据库状态
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              注意: 请确保已登录，这个操作需要认证。
            </p>
          </CardContent>
        </Card>

        <Card className="border-orange-200 bg-orange-50">
          <CardHeader>
            <CardTitle className="text-orange-800">
              第二步：完整修复 (如果检查失败)
            </CardTitle>
            <CardDescription className="text-orange-700">
              如果上面的检查发现问题，下载并执行完整的数据库重建脚本。
              <strong className="block mt-2">
                ⚠️ 警告：这会删除所有现有的用户数据！
              </strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={handleDownloadSQL}
              variant="outline"
              className="w-full border-orange-300 text-orange-800 hover:bg-orange-100"
            >
              📄 下载完整修复脚本
            </Button>

            <div className="text-sm space-y-2">
              <p className="font-semibold text-orange-800">完整修复步骤:</p>
              <ol className="list-decimal list-inside space-y-1 text-orange-700">
                <li>点击上面按钮下载 SQL 脚本</li>
                <li>
                  登录到{" "}
                  <a
                    href="https://supabase.com/dashboard"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    Supabase 控制台
                  </a>
                </li>
                <li>进入你的项目</li>
                <li>点击左侧菜单 "SQL Editor"</li>
                <li>将下载的 SQL 内容粘贴到编辑器中</li>
                <li>点击 "RUN" 按钮执行</li>
              </ol>

              <div className="bg-orange-100 p-3 rounded mt-3">
                <p className="font-semibold text-orange-800">数据丢失警告:</p>
                <p className="text-orange-700 text-xs">
                  这个脚本会删除并重新创建以下表：user_profiles,
                  user_credit_balance, credit_transaction
                  以及相关的所有数据。如果你有重要的用户数据，请先在 Supabase
                  控制台备份。
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>修复内容说明</CardTitle>
            <CardDescription>完整修复会创建以下数据库对象:</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <h4 className="font-semibold mb-2">数据表:</h4>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• user_profiles - 用户配置信息 (UUID 主键)</li>
                  <li>• user_credit_balance - 用户积分余额</li>
                  <li>• credit_transaction - 积分交易记录</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-2">数据库函数:</h4>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• upsert_user_profile - 创建/更新用户配置</li>
                  <li>• get_or_create_user_credit_balance - 积分管理</li>
                  <li>• update_updated_at_column - 时间触发器</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>故障排除</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <h4 className="font-semibold">
                Q: 为什么会出现 "public.user" 不存在的错误？
              </h4>
              <p className="text-muted-foreground">
                A: 之前的数据库脚本创建了错误的表结构。新架构使用 user_profiles
                表扩展 auth.users， 而不是创建独立的 user 表。
              </p>
            </div>
            <div>
              <h4 className="font-semibold">Q: 执行修复脚本后还是有问题？</h4>
              <p className="text-muted-foreground">
                A: 检查 Supabase 项目的环境变量设置，确保
                SUPABASE_SERVICE_ROLE_KEY 权限正确。 也可以在 Supabase 控制台的
                Authentication 设置中检查回调 URL 配置。
              </p>
            </div>
            <div>
              <h4 className="font-semibold">
                Q: 我有生产数据，不想丢失怎么办？
              </h4>
              <p className="text-muted-foreground">
                A: 在执行修复脚本前，先在 Supabase 控制台导出重要数据。
                修复后需要手动迁移数据到新的表结构。
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function DebugAuthPage() {
  return (
    <Suspense fallback={<div>加载中...</div>}>
      <DebugAuthContent />
    </Suspense>
  );
}
