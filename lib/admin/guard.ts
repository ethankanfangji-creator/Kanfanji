import { notFound } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

async function loadAdmin(): Promise<{ user: User } | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    if (data.user.app_metadata?.role !== "admin") return null;
    return { user: data.user };
  } catch {
    return null;
  }
}

export async function requireAdmin(): Promise<{ user: User }> {
  const admin = await loadAdmin();
  if (!admin) notFound();
  return admin;
}

export async function requireAdminResponse(): Promise<{ user: User } | NextResponse> {
  const admin = await loadAdmin();
  if (!admin) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return admin;
}

export function isAdminResponse(
  value: { user: User } | NextResponse,
): value is NextResponse {
  return value instanceof NextResponse;
}
