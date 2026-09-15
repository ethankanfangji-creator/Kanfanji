import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export function createClient() {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "缺少 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY。請在 Vercel → Settings → Environment Variables（Production）填入 kanfangji-prod 的值後 Redeploy。",
    );
  }
  return createBrowserClient(supabaseUrl, supabaseKey);
}
