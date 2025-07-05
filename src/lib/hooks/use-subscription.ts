import { useState, useEffect } from 'react';
import { useAuth } from './use-auth';

interface SubscriptionInfo {
  id: string;
  status: string;
  productId: string;
  subscriptionId: string;
  createdAt: string;
  updatedAt: string;
  endDate?: string;
}

interface SubscriptionStatusResponse {
  hasActiveSubscription: boolean;
  subscriptions: SubscriptionInfo[];
}

interface UseSubscriptionResult {
  hasActiveSubscription: boolean;
  subscriptions: SubscriptionInfo[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useSubscription(): UseSubscriptionResult {
  const { user, isAuthenticated } = useAuth();
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);
  const [subscriptions, setSubscriptions] = useState<SubscriptionInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSubscriptionStatus = async () => {
    if (!isAuthenticated || !user) {
      setHasActiveSubscription(false);
      setSubscriptions([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/payments/subscriptions');
      
      if (!response.ok) {
        throw new Error('Failed to fetch subscriptions');
      }

      const data = (await response.json()) as SubscriptionStatusResponse;
      const subs: SubscriptionInfo[] = (data.subscriptions || []).map((sub: any) => ({
        id: sub.id,
        status: sub.status,
        productId: sub.productId,
        subscriptionId: sub.subscriptionId,
        createdAt: sub.startDate,
        updatedAt: sub.endDate,
        endDate: sub.endDate,
      }));
      setSubscriptions(subs);
      setHasActiveSubscription(subs.some(sub => sub.status === 'active'));
    } catch (err) {
      console.error('Failed to fetch subscription status:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setHasActiveSubscription(false);
      setSubscriptions([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscriptionStatus();
  }, [isAuthenticated, user]);

  return {
    hasActiveSubscription,
    subscriptions,
    isLoading,
    error,
    refetch: fetchSubscriptionStatus,
  };
} 