import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { DB_DEV_LOGGER } from "~/app";

import * as schema from "./schema";

// 优先使用 `DATABASE_URL`，若不存在则尝试使用 Supabase CLI 在本地或部署环境中常见的
// `SUPABASE_DB_URL`。这样在忘记手动设置 `DATABASE_URL` 时也不会让 `throw` 导致整条 API
// 直接 500，而是留出更友好的容错空间。
//
// 在生产环境我们依然强制要求有效的数据库连接字符串，以避免意外使用到空连接。
const EFFECTIVE_DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL;

if (!EFFECTIVE_DATABASE_URL) {
  const message =
    "🔴 DATABASE_URL (或 SUPABASE_DB_URL) environment variable is not set";

  if (process.env.NODE_ENV === "production") {
    // 生产环境必须终止启动，避免产生不可预期的错误
    throw new Error(message);
  }

  // 开发环境下仅给出警告，避免整个项目直接崩溃，方便前端页面继续开发。
  // 任何尝试访问 `db` 时都会由于连接未初始化而抛错，提示开发者补充配置。
  console.warn(message);
}

/**
 * Caches the database connection in development to
 * prevent creating a new connection on every HMR update.
 */
type DbConnection = ReturnType<typeof postgres>;
const globalForDb = globalThis as unknown as {
  conn?: DbConnection;
};
export const conn: DbConnection =
  // 当缺失连接字符串时返回一个空对象以保证类型，但任何实际查询都会抛错。
  globalForDb.conn ??
  (EFFECTIVE_DATABASE_URL ? postgres(EFFECTIVE_DATABASE_URL) : ({} as any));
if (process.env.NODE_ENV !== "production") {
  globalForDb.conn = conn;
}

// Database connection instance
export const db = EFFECTIVE_DATABASE_URL
  ? drizzle(conn, {
      logger: DB_DEV_LOGGER && process.env.NODE_ENV !== "production",
      schema,
    })
  : ({} as any);
