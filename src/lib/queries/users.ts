import "server-only";

import type { User } from "../../db/schema/users/types";
import { createClient } from "~/lib/supabase/server";

/**
 * Fetches a user from the database by their ID.
 * @param userId - The ID of the user to fetch.
 * @returns The user object or null if not found.
 */
export async function getUserById(userId: string): Promise<null | User> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("user")
      .select("*")
      .eq("id", userId)
      .single();
    if (error) {
      console.error("Failed to fetch user by ID (Supabase):", error);
      return null;
    }
    return data as User ?? null;
  } catch (error) {
    console.error("Failed to fetch user by ID (Supabase):", error);
    return null;
  }
}
