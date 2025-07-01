"use client";

import { useState, useEffect } from "react";
import { useSupabaseSession, supabaseClient } from "~/lib/supabase-auth-client";

export default function AuthTestPage() {
  const { user, loading } = useSupabaseSession();
  const [sessionInfo, setSessionInfo] = useState<any>(null);
  const [apiTestResult, setApiTestResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);

  // 获取session信息
  const getSessionInfo = async () => {
    try {
      const { data, error } = await supabaseClient.auth.getSession();
      setSessionInfo({ data, error });
    } catch (error) {
      setSessionInfo({ error: error });
    }
  };

  // 测试API调用
  const testApiCall = async () => {
    setTesting(true);
    try {
      const testData = new FormData();
      testData.append("test", "true");

      const response = await fetch("/api/face-swap", {
        method: "POST",
        body: testData,
      });

      const result = await response.json();
      setApiTestResult({ status: response.status, result });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      setApiTestResult({ error: errorMessage });
    } finally {
      setTesting(false);
    }
  };

  useEffect(() => {
    if (!loading) {
      getSessionInfo();
    }
  }, [loading, user]);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">认证测试页面</h1>

      <div className="space-y-6">
        {/* 用户状态 */}
        <div className="bg-gray-100 p-4 rounded">
          <h2 className="text-lg font-semibold mb-2">用户状态</h2>
          <p>Loading: {loading ? "是" : "否"}</p>
          <p>User ID: {user?.id || "未登录"}</p>
          <p>User Email: {user?.email || "N/A"}</p>
        </div>

        {/* Session信息 */}
        <div className="bg-gray-100 p-4 rounded">
          <h2 className="text-lg font-semibold mb-2">Session 信息</h2>
          <button
            onClick={getSessionInfo}
            className="bg-blue-500 text-white px-4 py-2 rounded mb-2"
          >
            刷新 Session 信息
          </button>
          <pre className="text-xs overflow-auto bg-white p-2 rounded">
            {JSON.stringify(sessionInfo, null, 2)}
          </pre>
        </div>

        {/* API测试 */}
        <div className="bg-gray-100 p-4 rounded">
          <h2 className="text-lg font-semibold mb-2">API 测试</h2>
          <button
            onClick={testApiCall}
            disabled={testing || !user}
            className={`px-4 py-2 rounded ${
              testing || !user
                ? "bg-gray-400 text-gray-700"
                : "bg-green-500 text-white"
            }`}
          >
            {testing ? "测试中..." : "测试 API 调用"}
          </button>
          {apiTestResult && (
            <pre className="text-xs overflow-auto bg-white p-2 rounded mt-2">
              {JSON.stringify(apiTestResult, null, 2)}
            </pre>
          )}
        </div>

        {/* 调试信息 */}
        <div className="bg-gray-100 p-4 rounded">
          <h2 className="text-lg font-semibold mb-2">环境变量检查</h2>
          <p>
            NEXT_PUBLIC_SUPABASE_URL:{" "}
            {process.env.NEXT_PUBLIC_SUPABASE_URL ? "已设置" : "未设置"}
          </p>
          <p>
            NEXT_PUBLIC_SUPABASE_ANON_KEY:{" "}
            {process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "已设置" : "未设置"}
          </p>
        </div>
      </div>
    </div>
  );
}
