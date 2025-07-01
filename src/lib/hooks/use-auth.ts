import { useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabaseClient } from '~/lib/supabase-auth-client';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    // 获取当前用户
    const getUser = async () => {
      try {
        const { data: { user: currentUser }, error } = await supabaseClient.auth.getUser();
        
        if (mounted) {
          if (error) {
            console.error('Auth error:', error);
            setUser(null);
          } else {
            setUser(currentUser);
          }
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Failed to get user:', error);
        if (mounted) {
          setUser(null);
          setIsLoading(false);
        }
      }
    };

    // 监听认证状态变化
    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state changed:', event);
        
        if (mounted) {
          if (session?.user) {
            setUser(session.user);
          } else {
            setUser(null);
          }
          setIsLoading(false);
        }
      }
    );

    // 初始获取用户
    getUser();

    // 清理函数
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return {
    user,
    isLoading,
    isAuthenticated: !!user && !isLoading,
  };
}

// 检查用户是否有足够权限的Hook
function useRequireAuth(redirectTo: string = '/auth/sign-in') {
  const { user, isLoading } = useAuth();
  const [shouldRedirect, setShouldRedirect] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      setShouldRedirect(true);
    }
  }, [isLoading, user]);

  return {
    user,
    isLoading,
    isAuthenticated: !!user && !isLoading,
    shouldRedirect,
    redirectTo,
  };
} 
