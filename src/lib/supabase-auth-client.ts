import type { Provider, User } from "@supabase/supabase-js";

import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// 创建浏览器端 Supabase 客户端
export const createBrowserSupabaseClient = () => {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
};

// 创建并导出 Supabase 客户端实例
export const supabaseClient = createBrowserSupabaseClient();

// 认证方法封装
export const supabaseAuth = {
  // 获取当前用户
  getSession: async () => {
    // 保留方法名以兼容现有代码，但内部使用更安全的 getUser 方法
    return supabaseClient.auth.getUser();
  },

  // 重置密码
  resetPassword: async (email: string) => {
    return supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
  },

  // 第三方登录
  signInWithOAuth: async (provider: Provider) => {
    return supabaseClient.auth.signInWithOAuth({
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
      provider
    });
  },

  // 使用邮箱和密码登录
  signInWithPassword: async (email: string, password: string) => {
    return supabaseClient.auth.signInWithPassword({ email, password });
  },

  // 退出登录
  signOut: async () => {
    return supabaseClient.auth.signOut();
  },

  // 退出登录并重定向（新增方法）
  signOutWithRedirect: async (redirectTo: string = "/auth/sign-in") => {
    try {
      const { error } = await supabaseClient.auth.signOut();
      
      if (error) {
        console.error("Sign out error:", error.message);
        throw error;
      }
      
      // 使用 window.location 而不是 router 来确保完全刷新
      window.location.href = redirectTo;
    } catch (error) {
      console.error("Unexpected sign out error:", error);
      throw error;
    }
  }
};


// Hook 用于获取和监听认证状态
export const useSupabaseSession = () => {
  const [user, setUser] = useState<null | User>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    // 初始化时获取用户
    const getInitialSession = async () => {
      try {
        const {
          data: { user: currentUser },
        } = await supabaseClient.auth.getUser();
        if (mounted) {
          setUser(currentUser || null);
          setLoading(false);
        }
      } catch (error) {
        console.error("Error getting user:", error);
        if (mounted) {
          setUser(null);
          setLoading(false);
        }
      }
    };

    // 获取初始会话
    getInitialSession();

    // 监听认证状态变化
    const {
      data: { subscription },
    } = supabaseClient.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session);
      
      if (!mounted) return;

      // 当认证状态变化时，直接使用session中的user
      if (session?.user) {
        setUser(session.user);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    // 清理函数
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return { loading, user };
};

// Hook 用于获取当前用户或重定向，用于客户端
export const useSupabaseUserOrRedirect = (
  forbiddenUrl = "/auth/sign-in",
  okUrl = "",
  ignoreForbidden = false,
) => {
  const { loading, user } = useSupabaseSession();
  const router = useRouter();

  useEffect(() => {
    // 仅在加载完成后执行重定向
    if (!loading) {
      // 如果没有找到用户
      if (!user) {
        // 除非明确忽略，否则重定向到禁止页面
        if (!ignoreForbidden) {
          router.replace(forbiddenUrl);
        }
      } else if (okUrl) {
        // 如果找到用户并提供了 okUrl，则重定向到该 URL
        router.replace(okUrl);
      }
    }
  }, [loading, user, router, forbiddenUrl, okUrl, ignoreForbidden]);

  return { isPending: loading, loading: loading, user };
};

// 为了兼容原有代码，导出 useCurrentUserOrRedirect 作为 useSupabaseUserOrRedirect 的别名
export const useCurrentUserOrRedirect = useSupabaseUserOrRedirect;
