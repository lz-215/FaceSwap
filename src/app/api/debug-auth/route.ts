import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  
  // 获取所有相关的环境变量
  const debugInfo = {
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
      VERCEL_URL: process.env.VERCEL_URL,
      VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
    },
    oauth_config: {
      NEXT_PUBLIC_SUPABASE_GITHUB_ENABLED: process.env.NEXT_PUBLIC_SUPABASE_GITHUB_ENABLED,
      NEXT_PUBLIC_SUPABASE_GOOGLE_ENABLED: process.env.NEXT_PUBLIC_SUPABASE_GOOGLE_ENABLED,
    },
    request_info: {
      host: url.hostname,
      origin: url.origin,
      protocol: url.protocol,
      full_url: url.toString(),
    },
    calculated_urls: {
      callback_url_from_env: process.env.NEXT_PUBLIC_APP_URL ? 
        `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback` : 
        'NEXT_PUBLIC_APP_URL not set',
      callback_url_from_request: `${url.origin}/auth/callback`,
      recommended_github_callback: process.env.NEXT_PUBLIC_APP_URL ? 
        `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback` : 
        `${url.origin}/auth/callback`,
      recommended_google_callback: process.env.NEXT_PUBLIC_APP_URL ? 
        `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback` : 
        `${url.origin}/auth/callback`
    },
    oauth_providers: {
      github: {
        enabled: process.env.NEXT_PUBLIC_SUPABASE_GITHUB_ENABLED === "true",
        callback_url: process.env.NEXT_PUBLIC_APP_URL ? 
          `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback` : 
          `${url.origin}/auth/callback`,
        config_url: "https://github.com/settings/developers"
      },
      google: {
        enabled: process.env.NEXT_PUBLIC_SUPABASE_GOOGLE_ENABLED === "true",
        callback_url: process.env.NEXT_PUBLIC_APP_URL ? 
          `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback` : 
          `${url.origin}/auth/callback`,
        config_url: "https://console.cloud.google.com/apis/credentials"
      }
    },
    recommendations: [] as string[]
  };

  // 添加建议
  if (!process.env.NEXT_PUBLIC_APP_URL) {
    debugInfo.recommendations.push("❌ NEXT_PUBLIC_APP_URL 环境变量未设置 - 这是主要问题！");
  } else {
    debugInfo.recommendations.push("✅ NEXT_PUBLIC_APP_URL 已设置");
  }

  if (process.env.NEXT_PUBLIC_SUPABASE_GITHUB_ENABLED === "true") {
    debugInfo.recommendations.push("✅ GitHub 登录已启用");
    debugInfo.recommendations.push(`🔧 GitHub OAuth App 回调URL: ${debugInfo.oauth_providers.github.callback_url}`);
  } else {
    debugInfo.recommendations.push("⚠️ GitHub 登录未启用");
  }

  if (process.env.NEXT_PUBLIC_SUPABASE_GOOGLE_ENABLED === "true") {
    debugInfo.recommendations.push("✅ Google 登录已启用");
    debugInfo.recommendations.push(`🔧 Google OAuth 重定向URI: ${debugInfo.oauth_providers.google.callback_url}`);
  } else {
    debugInfo.recommendations.push("⚠️ Google 登录未启用");
  }

  return NextResponse.json(debugInfo);
} 