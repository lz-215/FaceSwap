import type { Provider } from "@supabase/supabase-js";

import { redirect } from "next/navigation";

import { createClient } from "./supabase/server";

// 获取当前用户
export const getCurrentSupabaseUser = async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user || null;
};

// 获取当前用户，如果未登录则重定向
export const getCurrentSupabaseUserOrRedirect = async (
  forbiddenUrl = "/auth/sign-in",
  okUrl = "",
  ignoreForbidden = false,
) => {
  const user = await getCurrentSupabaseUser();

  // 如果没有找到用户
  if (!user) {
    // 除非明确忽略，否则重定向到禁止页面
    if (!ignoreForbidden) {
      redirect(forbiddenUrl);
    }
    // 如果忽略了禁止，立即返回 null 用户
    return user; // 此时 user 是 null
  }

  // 如果找到用户并提供了 okUrl，则重定向到该URL
  if (okUrl) {
    redirect(okUrl);
  }

  // 如果找到用户但没有提供 okUrl，则返回用户
  return user;
};

// 将 Supabase 用户映射到应用程序用户
export const mapSupabaseUserToAppUser = async (user: any) => {
  // 这里可以添加额外的逻辑，如从数据库获取更多用户信息
  return {
    avatar: user.user_metadata?.avatar_url,
    email: user.email,
    emailVerified: !!user.email_confirmed_at,
    firstName: user.user_metadata?.first_name || "",
    id: user.id,
    lastName: user.user_metadata?.last_name || "",
    username: user.email?.split('@')[0] || user.id
  };
};

// 获取 OAuth 提供商配置
export const getOAuthProviders = () => {
  const providers: Provider[] = [];

  if (process.env.NEXT_PUBLIC_SUPABASE_GITHUB_ENABLED === "true") {
    providers.push("github");
  }

  if (process.env.NEXT_PUBLIC_SUPABASE_GOOGLE_ENABLED === "true") {
    providers.push("google");
  }

  return providers;
};

// 获取 Supabase 重定向 URL
export const getSupabaseRedirectUrl = (provider: Provider) => {
  return `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?provider=${provider}`;
};
