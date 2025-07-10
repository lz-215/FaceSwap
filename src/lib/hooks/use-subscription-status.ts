import { useEffect, useState } from "react";

export function useSubscriptionStatus() {
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStatus = async () => {
      setIsLoading(true);
      try {
        const res = await fetch("/api/user/subscription-status");
        const data = (await res.json()) as { status?: string };
        setStatus(data.status || null);
      } catch (e) {
        setStatus(null);
      } finally {
        setIsLoading(false);
      }
    };
    fetchStatus();
  }, []);

  return {
    isActive: status === "active",
    status,
    isLoading,
  };
} 