import { createClient } from "@/utils/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";

export const MEDIA_BUCKET = "viewing-media";

let client: SupabaseClient | null | undefined;

export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;

  if (!isSupabaseConfigured()) {
    client = null;
    return client;
  }

  client = createClient();
  return client;
}
