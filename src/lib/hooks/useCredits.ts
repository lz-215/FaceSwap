import {
  useEffect,
  useState,
  useCallback,
} from "react";
import { useAuth } from "./use-auth";
import { supabaseClient } from "~/lib/supabase-auth-client";

interface CreditsState {
  balance: number;
  totalRecharged: number;
  totalConsumed: number;
  transactions: any[]; // Replace 'any' with a proper type
  isLoading: boolean;
  error: string | null;
}

// Add types for API responses
interface BalanceApiResponse {
  balance: number;
  totalRecharged: number;
  totalConsumed: number;
}
interface TransactionsApiResponse {
  transactions: any[]; // Replace 'any' with a proper type if available
}

export function useCredits() {
  const { user, isLoading: authLoading } = useAuth();
  const [credits, setCredits] = useState<CreditsState>({
    balance: 0,
    totalRecharged: 0,
    totalConsumed: 0,
    transactions: [],
    isLoading: true,
    error: null,
  });

  const fetchCredits = useCallback(async () => {
    if (!user) {
      setCredits({ balance: 0, totalRecharged: 0, totalConsumed: 0, transactions: [], isLoading: false, error: null });
      return;
    }

    setCredits((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      // 直接调用 Supabase RPC，自动初始化新用户积分
      const { data, error } = await supabaseClient.rpc('get_user_credits_v2', { p_user_id: user.id });
      if (error) throw error;
      setCredits((prev) => ({
        ...prev,
        balance: data.balance || 0,
        totalRecharged: data.totalRecharged || 0,
        totalConsumed: data.totalConsumed || 0,
        isLoading: false,
        error: null,
      }));
    } catch (error) {
      console.error("Failed to fetch credits:", error);
      setCredits({
        balance: 0,
        totalRecharged: 0,
        totalConsumed: 0,
        transactions: [],
        isLoading: false,
        error: error instanceof Error ? error.message : "Failed to load credits",
      });
    }
  }, [user]);

  const consumeCredits = async (amount: number, description: string) => {
    if (!user) {
      throw new Error("User not authenticated");
    }

    const response = await fetch("/api/credits/consume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount, description }),
    });

    if (!response.ok) {
      const errorData = (await response.json()) as { message?: string };
      throw new Error(errorData.message || "Failed to consume credits");
    }

    const result = await response.json();
    
    // Refresh credits after consumption
    await fetchCredits();

    return result;
  };

  const addBonusCredits = async (amount: number, reason: string, metadata: Record<string, any> = {}) => {
    if (!user) {
      throw new Error("User not authenticated");
    }

    const response = await fetch("/api/credits/bonus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount, reason, metadata }),
    });

    if (!response.ok) {
      const errorData = (await response.json()) as { message?: string };
      throw new Error(errorData.message || "Failed to add bonus credits");
    }

    const result = await response.json();
    // Refresh credits after bonus
    await fetchCredits();
    return result;
  };

  useEffect(() => {
    if (!authLoading) {
      fetchCredits();
    }
  }, [user, authLoading, fetchCredits]);

  return {
    ...credits,
    consumeCredits,
    addBonusCredits,
    refreshCredits: fetchCredits,
  };
}
