import { useEffect, useState } from "react";

// 通用获取订阅状态的函数（可服务端/客户端调用）
export async function getSubscriptionStatus(): Promise<{ isActive: boolean; status: string | null }> {
  try {
    const res = await fetch("/api/user/subscription-status");
    const data = (await res.json()) as { status?: string };
    const status = data.status || null;
    return { isActive: status === "active", status };
  } catch (e) {
    return { isActive: false, status: null };
  }
}

export function useSubscriptionStatus() {
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStatus = async () => {
      setIsLoading(true);
      const { status } = await getSubscriptionStatus();
      setStatus(status);
      setIsLoading(false);
    };
    fetchStatus();
  }, []);

  return {
    isActive: status === "active",
    status,
    isLoading,
  };
} 