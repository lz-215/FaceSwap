import { useEffect, useState } from 'react';
import { useAuth } from './use-auth';
import { supabaseClient } from '~/lib/supabase-auth-client';

interface SimpleCreditsState {
  balance: number;
  isLoading: boolean;
  error: string | null;
}

export function useSimpleCredits() {
  const { user, isLoading: authLoading } = useAuth();
  const [credits, setCredits] = useState<SimpleCreditsState>({
    balance: 0,
    isLoading: true,
    error: null,
  });

  // 获取用户积分余额
  const fetchCredits = async () => {
    if (!user) {
      setCredits({ balance: 0, isLoading: false, error: null });
      return;
    }

    try {
      setCredits(prev => ({ ...prev, isLoading: true, error: null }));

      // 使用简化的数据库函数
      const { data, error } = await supabaseClient
        .rpc('get_credits', { user_id: user.id });

      if (error) {
        throw error;
      }

      setCredits({
        balance: data || 0,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      console.error('Failed to fetch credits:', error);
      setCredits({
        balance: 0,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load credits',
      });
    }
  };

  // 消费积分
  const useCredits = async (amount: number = 1): Promise<boolean> => {
    if (!user) {
      throw new Error('User not authenticated');
    }

    try {
      // 使用简化的数据库函数
      const { data, error } = await supabaseClient
        .rpc('use_credits', { 
          user_id: user.id, 
          amount: amount 
        });

      if (error) {
        throw error;
      }

      // 如果成功，更新本地状态
      if (data) {
        setCredits(prev => ({
          ...prev,
          balance: Math.max(0, prev.balance - amount),
        }));
        return true;
      }

      return false; // 余额不足
    } catch (error) {
      console.error('Failed to use credits:', error);
      throw error;
    }
  };

  // 充值积分
  const addCredits = async (amount: number): Promise<boolean> => {
    if (!user) {
      throw new Error('User not authenticated');
    }

    try {
      const { data, error } = await supabaseClient
        .rpc('add_credits', {
          user_id: user.id,
          amount: amount,
        });

      if (error) {
        throw error;
      }

      // 刷新积分余额
      await fetchCredits();
      return true;
    } catch (error) {
      console.error('Failed to add credits:', error);
      throw error;
    }
  };

  // 记录人脸交换日志
  const logFaceSwap = async (status: string = 'completed', errorMsg?: string) => {
    if (!user) return;

    try {
      await supabaseClient.rpc('log_face_swap', {
        user_id: user.id,
        status: status,
        error_msg: errorMsg || null,
      });
    } catch (error) {
      console.error('Failed to log face swap:', error);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      fetchCredits();
    }
  }, [user, authLoading]);

  return {
    balance: credits.balance,
    isLoading: credits.isLoading,
    error: credits.error,
    useCredits,
    addCredits,
    logFaceSwap,
    refreshCredits: fetchCredits,
  };
} 
