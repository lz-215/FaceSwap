import { createClient } from "@supabase/supabase-js";

// 创建 Supabase 客户端
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// 确保环境变量存在
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("缺少 Supabase 环境变量");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
