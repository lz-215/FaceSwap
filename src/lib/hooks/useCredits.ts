import {
  useEffect,
  useState,
  useCallback,
} from "react";
import { useAuth } from "./use-auth";

interface CreditsState {
  balance: number;
  totalRecharged: number;
  totalConsumed: number;
  transactions: any[]; // Replace 'any' with a proper type
  isLoading: boolean;
  error: string | null;
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
      const [balanceRes, transactionsRes] = await Promise.all([
        fetch("/api/credits/balance"),
        fetch("/api/credits/transactions"),
      ]);

      if (!balanceRes.ok || !transactionsRes.ok) {
        throw new Error("Failed to fetch credits data");
      }

      const balanceData = await balanceRes.json();
      const transactionsData = await transactionsRes.json();

      setCredits({
        balance: balanceData.balance,
        totalRecharged: balanceData.totalRecharged,
        totalConsumed: balanceData.totalConsumed,
        transactions: transactionsData.transactions,
        isLoading: false,
        error: null,
      });
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
      const errorData = await response.json();
      throw new Error(errorData.message || "Failed to consume credits");
    }

    const result = await response.json();
    
    // Refresh credits after consumption
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
    refreshCredits: fetchCredits,
  };
}
