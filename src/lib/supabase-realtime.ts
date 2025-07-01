import { supabase } from '~/lib/supabase-client';

interface RealtimeChannelCallbackParams<T> {
  eventType: "DELETE" | "INSERT" | "UPDATE";
  new?: T;
  old?: T;
}

// 实时订阅辅助函数
export const createRealtimeSubscription = <T>(
  tableName: string,
  callback: (payload: RealtimeChannelCallbackParams<T>) => void,
  filter?: {
    event: "DELETE" | "INSERT" | "UPDATE";
    filter?: string;
    schema?: string;
  },
) => {
  const channel = supabase
    .channel(`table-changes-${tableName}`)
    .on(
      "postgres_changes" as any,
      {
        event: filter?.event || "*",
        filter: filter?.filter,
        schema: filter?.schema || "public",
        table: tableName,
      },
      callback as any,
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};
