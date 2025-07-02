"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseAuth } from "~/lib/supabase-auth-client";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { GitHubIcon } from "~/components/icons/github";
import { GoogleIcon } from "~/components/icons/google";

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
    recommended_google_callback: string;
  };
  oauth_providers: {
    github: {
      enabled: boolean;
      callback_url: string;
      config_url: string;
    };
    google: {
      enabled: boolean;
      callback_url: string;
      config_url: string;
    };
  };
  recommendations: string[];
}

export default function DebugOAuthPage() {
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [githubTestLoading, setGithubTestLoading] = useState(false);
  const [googleTestLoading, setGoogleTestLoading] = useState(false);

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
    setGithubTestLoading(true);
    try {
      console.log("🚀 开始测试 GitHub 登录...");

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
      const redirectUrl = `${baseUrl}/auth/callback`;

      console.log("📍 GitHub 重定向URL:", redirectUrl);

      await supabaseAuth.signInWithOAuth("github");
    } catch (error) {
      console.error("❌ GitHub 登录失败:", error);
      alert(`GitHub 登录失败: ${error}`);
      setGithubTestLoading(false);
    }
  };

  const testGoogleLogin = async () => {
    setGoogleTestLoading(true);
    try {
      console.log("🚀 开始测试 Google 登录...");

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
      const redirectUrl = `${baseUrl}/auth/callback`;

      console.log("📍 Google 重定向URL:", redirectUrl);

      await supabaseAuth.signInWithOAuth("google");
    } catch (error) {
      console.error("❌ Google 登录失败:", error);
      alert(`Google 登录失败: ${error}`);
      setGoogleTestLoading(false);
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
          {/* OAuth 提供商状态 */}
          <Card>
            <CardHeader>
              <CardTitle>🎯 OAuth 提供商状态</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div
                  className={`p-4 rounded-lg border ${
                    debugInfo.oauth_providers?.github?.enabled
                      ? "bg-green-50 border-green-200 text-green-800"
                      : "bg-red-50 border-red-200 text-red-800"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <GitHubIcon className="h-5 w-5" />
                    <span className="font-semibold">GitHub 登录</span>
                  </div>
                  <p className="text-sm mt-1">
                    {debugInfo.oauth_providers?.github?.enabled
                      ? "✅ 已启用"
                      : "❌ 未启用"}
                  </p>
                </div>

                <div
                  className={`p-4 rounded-lg border ${
                    debugInfo.oauth_providers?.google?.enabled
                      ? "bg-green-50 border-green-200 text-green-800"
                      : "bg-red-50 border-red-200 text-red-800"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <GoogleIcon className="h-5 w-5" />
                    <span className="font-semibold">Google 登录</span>
                  </div>
                  <p className="text-sm mt-1">
                    {debugInfo.oauth_providers?.google?.enabled
                      ? "✅ 已启用"
                      : "❌ 未启用"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 快速测试 */}
          <Card>
            <CardHeader>
              <CardTitle>🧪 OAuth 登录测试</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Button
                  onClick={testGitHubLogin}
                  disabled={
                    githubTestLoading ||
                    !debugInfo.oauth_providers?.github?.enabled
                  }
                  className="h-14 bg-gray-900 hover:bg-gray-800 text-white"
                  size="lg"
                >
                  <div className="flex items-center gap-3">
                    <GitHubIcon className="h-5 w-5" />
                    <span>
                      {githubTestLoading
                        ? "正在重定向到 GitHub..."
                        : "🔴 测试 GitHub 登录"}
                    </span>
                  </div>
                </Button>

                <Button
                  onClick={testGoogleLogin}
                  disabled={
                    googleTestLoading ||
                    !debugInfo.oauth_providers?.google?.enabled
                  }
                  className="h-14 bg-white hover:bg-gray-50 text-gray-900 border border-gray-300"
                  size="lg"
                  variant="outline"
                >
                  <div className="flex items-center gap-3">
                    <GoogleIcon className="h-5 w-5" />
                    <span>
                      {googleTestLoading
                        ? "正在重定向到 Google..."
                        : "🔵 测试 Google 登录"}
                    </span>
                  </div>
                </Button>
              </div>

              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                <p>
                  <strong>测试说明：</strong>
                </p>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>点击按钮测试对应的 OAuth 登录</li>
                  <li>观察浏览器是否正确重定向到对应平台</li>
                  <li>检查是否能成功返回到应用</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* 诊断结果 */}
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

          {/* OAuth 回调URL配置 */}
          <Card>
            <CardHeader>
              <CardTitle>🔗 OAuth 回调URL 配置指南</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* GitHub配置 */}
                <div className="p-4 border border-gray-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-3">
                    <GitHubIcon className="h-5 w-5" />
                    <h4 className="font-semibold">GitHub OAuth App 配置</h4>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-600">
                      Authorization callback URL:
                    </label>
                    <div className="flex items-center gap-2">
                      <code className="bg-gray-100 px-3 py-2 rounded flex-1 text-sm">
                        {debugInfo.oauth_providers?.github?.callback_url ||
                          debugInfo.calculated_urls.recommended_github_callback}
                      </code>
                      <Button
                        size="sm"
                        onClick={() =>
                          copyToClipboard(
                            debugInfo.oauth_providers?.github?.callback_url ||
                              debugInfo.calculated_urls
                                .recommended_github_callback
                          )
                        }
                      >
                        复制
                      </Button>
                    </div>
                    <p className="text-xs text-gray-500">
                      在{" "}
                      <a
                        href="https://github.com/settings/developers"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        GitHub Developer Settings
                      </a>{" "}
                      中配置此URL
                    </p>
                  </div>
                </div>

                {/* Google配置 */}
                <div className="p-4 border border-gray-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-3">
                    <GoogleIcon className="h-5 w-5" />
                    <h4 className="font-semibold">Google OAuth 配置</h4>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-600">
                      授权重定向URI:
                    </label>
                    <div className="flex items-center gap-2">
                      <code className="bg-gray-100 px-3 py-2 rounded flex-1 text-sm">
                        {debugInfo.oauth_providers?.google?.callback_url ||
                          debugInfo.calculated_urls.recommended_google_callback}
                      </code>
                      <Button
                        size="sm"
                        onClick={() =>
                          copyToClipboard(
                            debugInfo.oauth_providers?.google?.callback_url ||
                              debugInfo.calculated_urls
                                .recommended_google_callback
                          )
                        }
                      >
                        复制
                      </Button>
                    </div>
                    <p className="text-xs text-gray-500">
                      在{" "}
                      <a
                        href="https://console.cloud.google.com/apis/credentials"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        Google Cloud Console
                      </a>{" "}
                      中配置此URI
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Supabase配置检查 */}
          <Card>
            <CardHeader>
              <CardTitle>⚙️ Supabase 配置检查</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <h4 className="font-semibold text-yellow-800 mb-2">
                    🔧 Supabase 配置清单
                  </h4>
                  <ul className="text-sm text-yellow-700 space-y-1">
                    <li>
                      ✅ 确保在 Supabase Dashboard → Authentication → Providers
                      中启用了对应的提供商
                    </li>
                    <li>✅ 输入正确的 Client ID 和 Client Secret</li>
                    <li>
                      ✅ 在 URL Configuration 中添加重定向URL:{" "}
                      <code>{debugInfo.request_info.origin}/**</code>
                    </li>
                  </ul>
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
        </div>
      )}
    </div>
  );
}
