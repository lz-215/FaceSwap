"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseAuth } from "~/lib/supabase-auth-client";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";

interface DebugInfo {
  environment: {
    NODE_ENV?: string;
    NEXT_PUBLIC_APP_URL?: string;
    VERCEL_URL?: string;
    VERCEL_PROJECT_PRODUCTION_URL?: string;
  };
  oauth_config: {
    NEXT_PUBLIC_SUPABASE_GITHUB_ENABLED?: string;
    NEXT_PUBLIC_SUPABASE_GOOGLE_ENABLED?: string;
  };
  request_info: {
    host: string;
    origin: string;
    protocol: string;
    full_url: string;
  };
  calculated_urls: {
    callback_url_from_env: string;
    callback_url_from_request: string;
    recommended_github_callback: string;
  };
  recommendations: string[];
}

export default function DebugOAuthPage() {
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [testLoading, setTestLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/debug-auth")
      .then((res) => res.json())
      .then((data) => {
        setDebugInfo(data as DebugInfo);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch debug info:", err);
        setLoading(false);
      });
  }, []);

  const testGitHubLogin = async () => {
    setTestLoading(true);
    try {
      console.log("🚀 开始测试 GitHub 登录...");

      // 获取当前的重定向URL
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
      const redirectUrl = `${baseUrl}/auth/callback`;

      console.log("📍 计算的重定向URL:", redirectUrl);

      await supabaseAuth.signInWithOAuth("github");
    } catch (error) {
      console.error("❌ GitHub 登录失败:", error);
      alert(`GitHub 登录失败: ${error}`);
      setTestLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("已复制到剪贴板");
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">加载调试信息...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">🔍 OAuth 登录调试工具</h1>

      {debugInfo && (
        <div className="space-y-6">
          {/* 快速测试 */}
          <Card>
            <CardHeader>
              <CardTitle>🧪 快速测试</CardTitle>
            </CardHeader>
            <CardContent>
              <Button
                onClick={testGitHubLogin}
                disabled={testLoading}
                className="w-full"
              >
                {testLoading ? "正在重定向到 GitHub..." : "🔴 测试 GitHub 登录"}
              </Button>
              <p className="text-sm text-muted-foreground mt-2">
                点击此按钮测试 GitHub 登录。观察浏览器是否正确重定向。
              </p>
            </CardContent>
          </Card>

          {/* 建议 */}
          <Card>
            <CardHeader>
              <CardTitle>💡 诊断结果</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {debugInfo.recommendations.map((rec, index) => (
                  <div
                    key={index}
                    className={`p-2 rounded ${
                      rec.includes("❌")
                        ? "bg-red-50 text-red-700"
                        : rec.includes("⚠️")
                        ? "bg-yellow-50 text-yellow-700"
                        : "bg-green-50 text-green-700"
                    }`}
                  >
                    {rec}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* URL 配置 */}
          <Card>
            <CardHeader>
              <CardTitle>🔗 URL 配置信息</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <label className="font-semibold">
                    GitHub OAuth App 回调URL (复制此URL):
                  </label>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="bg-gray-100 px-2 py-1 rounded flex-1">
                      {debugInfo.calculated_urls.recommended_github_callback}
                    </code>
                    <Button
                      size="sm"
                      onClick={() =>
                        copyToClipboard(
                          debugInfo.calculated_urls.recommended_github_callback
                        )
                      }
                    >
                      复制
                    </Button>
                  </div>
                </div>

                <div>
                  <label className="font-semibold">
                    当前环境变量 NEXT_PUBLIC_APP_URL:
                  </label>
                  <code className="block bg-gray-100 px-2 py-1 rounded mt-1">
                    {debugInfo.environment.NEXT_PUBLIC_APP_URL || "未设置"}
                  </code>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 环境变量详情 */}
          <Card>
            <CardHeader>
              <CardTitle>🌍 环境变量详情</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="bg-gray-100 p-4 rounded overflow-x-auto text-sm">
                {JSON.stringify(debugInfo, null, 2)}
              </pre>
            </CardContent>
          </Card>

          {/* 修复步骤 */}
          <Card>
            <CardHeader>
              <CardTitle>🛠️ 修复步骤</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="border-l-4 border-red-500 pl-4">
                  <h4 className="font-semibold">
                    如果 NEXT_PUBLIC_APP_URL 未设置:
                  </h4>
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    <li>登录 Vercel Dashboard</li>
                    <li>进入项目 → Settings → Environment Variables</li>
                    <li>
                      添加: NEXT_PUBLIC_APP_URL = https://your-domain.vercel.app
                    </li>
                    <li>重新部署项目</li>
                  </ol>
                </div>

                <div className="border-l-4 border-yellow-500 pl-4">
                  <h4 className="font-semibold">GitHub OAuth App 配置:</h4>
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    <li>
                      访问 GitHub → Settings → Developer settings → OAuth Apps
                    </li>
                    <li>编辑您的 OAuth App</li>
                    <li>设置 Authorization callback URL 为上面显示的URL</li>
                    <li>保存更改</li>
                  </ol>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
