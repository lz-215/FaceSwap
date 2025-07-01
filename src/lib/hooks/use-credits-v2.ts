import { useState, useEffect, useCallback } from 'react';
import { supabaseClient } from '~/lib/supabase-auth-client';
import { useAuth } from './use-auth';

interface CreditBalance {
  balance: number;
  totalRecharged: number;
  totalConsumed: number;
  createdAt: string;
  updatedAt: string;
}

interface CreditTransaction {
  id: string;
  userId: string;
  type: 'recharge' | 'consumption' | 'refund' | 'bonus' | 'subscription' | 'expiration';
  amount: number;
  balanceAfter: number;
  description: string | null;
  relatedRechargeId: string | null;
  relatedUploadId: string | null;
  metadata: any;
  createdAt: string;
}

interface CreditPackage {
  id: string;
  name: string;
  description: string | null;
  credits: number;
  price: number;
  currency: string;
  isActive: boolean;
  isPopular: boolean;
  sortOrder: number;
}

interface CreditsState {
  balance: number;
  totalRecharged: number;
  totalConsumed: number;
  isLoading: boolean;
  error: string | null;
}

export function useCreditsV2() {
  const { user, isAuthenticated } = useAuth();
  const [credits, setCredits] = useState<CreditsState>({
    balance: 0,
    totalRecharged: 0,
    totalConsumed: 0,
    isLoading: true,
    error: null,
  });

  // 获取积分信息
  const fetchCredits = useCallback(async () => {
    if (!user || !isAuthenticated) {
      setCredits(prev => ({ ...prev, isLoading: false }));
      return;
    }

    try {
      console.log('🔍 useCreditsV2: 开始获取用户积分', { userId: user.id });
      setCredits(prev => ({ ...prev, isLoading: true, error: null }));

      const { data, error } = await supabaseClient.rpc('get_user_credits_v2', {
        user_id: user.id,
      });

      console.log('🔍 useCreditsV2: 积分查询结果', { data, error });

      if (error) {
        throw error;
      }

      setCredits({
        balance: data.balance || 0,
        totalRecharged: data.totalRecharged || 0,
        totalConsumed: data.totalConsumed || 0,
        isLoading: false,
        error: null,
      });

      console.log('✅ useCreditsV2: 积分获取成功', {
        balance: data.balance,
        totalRecharged: data.totalRecharged,
        totalConsumed: data.totalConsumed,
      });
    } catch (error: any) {
      console.error('❌ useCreditsV2: 积分获取失败:', error);
      setCredits(prev => ({
        ...prev,
        isLoading: false,
        error: error.message || 'Failed to fetch credits',
      }));
    }
  }, [user, isAuthenticated, supabaseClient]);

  // 消费积分
  const consumeCredits = async (
    actionType: string = 'face_swap',
    amountOverride?: number,
    description?: string
  ): Promise<{ success: boolean; balanceAfter?: number; error?: string }> => {
    if (!user || !isAuthenticated) {
      throw new Error('User not authenticated');
    }

    try {
      const { data, error } = await supabaseClient.rpc('consume_credits_v2', {
        user_id: user.id,
        action_type: actionType,
        amount_override: amountOverride || null,
        transaction_description: description || null,
      });

      if (error) {
        throw error;
      }

      if (!data.success) {
        return {
          success: false,
          error: data.message || 'Failed to consume credits',
        };
      }

      // 更新本地状态
      setCredits(prev => ({
        ...prev,
        balance: data.balanceAfter,
        totalConsumed: prev.totalConsumed + data.amountConsumed,
      }));

      return {
        success: true,
        balanceAfter: data.balanceAfter,
      };
    } catch (error: any) {
      console.error('Failed to consume credits:', error);
      return {
        success: false,
        error: error.message || 'Failed to consume credits',
      };
    }
  };

  // 充值积分
  const rechargeCredits = async (
    amount: number,
    paymentIntentId?: string,
    description?: string
  ): Promise<{ success: boolean; balanceAfter?: number; error?: string }> => {
    if (!user || !isAuthenticated) {
      throw new Error('User not authenticated');
    }

    try {
      const { data, error } = await supabaseClient.rpc('recharge_credits_v2', {
        user_id: user.id,
        amount_to_add: amount,
        payment_intent_id: paymentIntentId || null,
        transaction_description: description || '积分充值',
      });

      if (error) {
        throw error;
      }

      // 更新本地状态
      setCredits(prev => ({
        ...prev,
        balance: data.balanceAfter,
        totalRecharged: prev.totalRecharged + data.amountAdded,
      }));

      return {
        success: true,
        balanceAfter: data.balanceAfter,
      };
    } catch (error: any) {
      console.error('Failed to recharge credits:', error);
      return {
        success: false,
        error: error.message || 'Failed to recharge credits',
      };
    }
  };

  // 获取积分交易历史
  const getCreditHistory = async (limit: number = 50): Promise<CreditTransaction[]> => {
    if (!user || !isAuthenticated) {
      return [];
    }

    try {
      const { data, error } = await supabaseClient
        .from('credit_transaction')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Failed to fetch credit history:', error);
      return [];
    }
  };

  // 获取积分套餐
  const getCreditPackages = async (): Promise<CreditPackage[]> => {
    try {
      const { data, error } = await supabaseClient
        .from('credit_package')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Failed to fetch credit packages:', error);
      return [];
    }
  };

  // 检查是否有足够积分
  const hasEnoughCredits = (requiredCredits: number = 1): boolean => {
    return credits.balance >= requiredCredits;
  };

  useEffect(() => {
    fetchCredits();
  }, [fetchCredits]);

  return {
    // 状态
    balance: credits.balance,
    totalRecharged: credits.totalRecharged,
    totalConsumed: credits.totalConsumed,
    isLoading: credits.isLoading,
    error: credits.error,

    // 方法
    fetchCredits,
    consumeCredits,
    rechargeCredits,
    getCreditHistory,
    getCreditPackages,
    hasEnoughCredits,
  };
} 
