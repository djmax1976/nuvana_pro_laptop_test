import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client for OAuth authentication
 * Initialized with environment variables from .env.local
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// Create client with fallback values for build time
// Runtime will throw if actually used without proper env vars
export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-key",
);
