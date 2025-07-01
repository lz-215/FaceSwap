"use client";

import { useCallback, useEffect, useState } from "react";

import { supabase } from "~/lib/supabase-client";
import { createRealtimeSubscription } from "~/lib/supabase-realtime";

interface CreditTransaction {
  actionType: string;
  amount: number;
  createdAt: string;
  description?: string;
  id: string;
  updatedAt: string;
  userId: string;
}

interface UseCreditTransactionsReturn {
  error: null | string;
  hasMore: boolean;
  isLoading: boolean;
  loadMore: () => Promise<void>;
  refetch: () => Promise<void>;
  transactions: CreditTransaction[];
}

/**
 * 浣跨敤 Supabase 瀹炴椂璁㈤槄绠＄悊鐢ㄦ埛绉垎浜ゆ槗璁板綍
 * @param limit 姣忛〉鍔犺浇鐨勮褰曟暟
 * @returns 绉垎浜ゆ槗璁板綍鐘舵€佸拰鎿嶄綔鍑芥暟
 */
export function useCreditTransactions(limit = 10): UseCreditTransactionsReturn {
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<null | string>(null);
  const [hasMore, setHasMore] = useState(true);
  const [userId, setUserId] = useState<null | string>(null);
  const [page, setPage] = useState(0);

  // 鑾峰彇褰撳墠鐢ㄦ埛ID
  useEffect(() => {
    const getCurrentUser = async () => {
      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();
        if (authError) {
          setError(`鑾峰彇鐢ㄦ埛淇℃伅澶辫触: ${authError.message}`);
          setIsLoading(false);
          return;
        }
        if (user) {
          setUserId(user.id);
        } else {
          setIsLoading(false);
        }
      } catch (err) {
        setError(`鑾峰彇鐢ㄦ埛淇℃伅澶辫触: ${err}`);
        setIsLoading(false);
      }
    };
    getCurrentUser();
  }, []);

  // 鑾峰彇绉垎浜ゆ槗璁板綍
  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  const fetchTransactions = useCallback(async (pageNum = 0, append = false) => {
    if (!userId) return;

    if (!append) {
      setIsLoading(true);
    }
    setError(null);

    try {
      const offset = pageNum * limit;
      const { data, error: queryError } = await supabase
        .from("credit_transaction")
        .select("*")
        .eq("userId", userId)
        .order("createdAt", { ascending: false })
        .range(offset, offset + limit - 1);

      if (queryError) {
        setError("鑾峰彇绉垎浜ゆ槗璁板綍澶辫触");
        return;
      }

      if (data) {
        if (data.length < limit) {
          setHasMore(false);
        }

        if (append) {
          setTransactions((prev) => [...prev, ...data]);
        } else {
          setTransactions(data);
        }
      }
    } catch (err) {
      setError(`鑾峰彇绉垎浜ゆ槗璁板綍澶辫触: ${err}`);
    } finally {
      setIsLoading(false);
    }
  }, [userId, limit, supabase]);

  // 鍔犺浇鏇村璁板綍
  const loadMore = async () => {
    if (!hasMore || isLoading) return;
    const nextPage = page + 1;
    setPage(nextPage);
    await fetchTransactions(nextPage, true);
  };

  // 閲嶆柊鑾峰彇璁板綍
  const refetch = async () => {
    setPage(0);
    setHasMore(true);
    await fetchTransactions(0, false);
  };

  // 鍒濆鍖栫Н鍒嗕氦鏄撹褰?
  useEffect(() => {
    if (userId) {
      fetchTransactions();
    }
  }, [userId, fetchTransactions]);

  // 璁剧疆瀹炴椂璁㈤槄
  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    if (!userId) return;

    // 璁㈤槄鏂扮殑绉垎浜ゆ槗璁板綍
    const unsubscribeTransaction = createRealtimeSubscription(
      "credit_transaction",
      (payload) => {
        if (payload.new && (payload.new as any).userId === userId) {
          // 灏嗘柊浜ゆ槗璁板綍娣诲姞鍒板垪琛ㄩ《閮?
          setTransactions((prev) => [
            payload.new as CreditTransaction,
            ...prev,
          ]);
        }
      },
      {
        event: "INSERT",
        filter: `userId=eq.${userId}`,
      },
    );

    return () => {
      unsubscribeTransaction();
    };
  }, [userId, createRealtimeSubscription, setTransactions]);

  return {
    error,
    hasMore,
    isLoading,
    loadMore,
    refetch,
    transactions,
  };
}
