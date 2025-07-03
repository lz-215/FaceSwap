import "server-only";

import { createClient } from "~/lib/supabase/server";
import type { User } from "~/lib/database-types";

/**
 * Fetches a user from the database by their ID.
 * @param id - The ID of the user to fetch.
 * @returns The user object or null if not found.
 */
export async function getUserById(id: string): Promise<User | null> {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('user')
    .select('*')
    .eq('id', id)
    .single();
    
  if (error) {
    console.error('Error fetching user:', error);
    return null;
  }
  
  return data;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('user')
    .select('*')
    .eq('email', email)
    .single();
    
  if (error) {
    console.error('Error fetching user:', error);
    return null;
  }
  
  return data;
}
