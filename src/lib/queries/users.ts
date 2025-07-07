import "server-only";

import { createClient } from "~/lib/supabase/server";
import type { UserProfile } from "~/lib/database-types";

/**
 * Fetches a user profile from the database by their ID.
 * @param id - The ID of the user to fetch.
 * @returns The user profile object or null if not found.
 */
export async function getUserById(id: string): Promise<UserProfile | null> {
  const supabase = await createClient();
  
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', id)
    .single();
    
  if (error) {
    console.error('Error fetching user profile:', error);
    return null;
  }
  
  return data;
}

/**
 * Gets the current authenticated user's profile.
 * @returns The current user's profile or null if not authenticated.
 */
export async function getCurrentUserProfile(): Promise<UserProfile | null> {
  const supabase = await createClient();
  
  // Get current user from auth
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    console.error('Error getting current user:', authError);
    return null;
  }
  
  // Get user profile
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single();
    
  if (error) {
    console.error('Error fetching current user profile:', error);
    return null;
  }
  
  return data;
}
