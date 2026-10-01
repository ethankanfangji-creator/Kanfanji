"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createSessionCode } from "@/lib/viewing-session-code";

const VIEWING_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function startViewingSession(formData: FormData) {
  const viewingId = String(formData.get("viewingId") || "");
  if (!VIEWING_ID.test(viewingId)) redirect("/");
  const { supabase, user } = await requireUser();
  const { data: viewing, error: viewingError } = await supabase
    .from("viewings")
    .select("id")
    .eq("id", viewingId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (viewingError || !viewing) redirect("/");

  const { data: existing, error: existingError } = await supabase
    .from("viewing_sessions")
    .select("code")
    .eq("viewing_id", viewingId)
    .eq("created_by", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing?.code) redirect(`/live/${existing.code}`);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = createSessionCode();
    const { error } = await supabase.from("viewing_sessions").insert({
      viewing_id: viewingId,
      code,
      status: "active",
      created_by: user.id,
    });
    if (!error) redirect(`/live/${code}`);
    if (!error.message.includes("viewing_sessions_code_key")) throw new Error(error.message);
  }
  throw new Error("開始看房失敗，請再試一次。");
}
