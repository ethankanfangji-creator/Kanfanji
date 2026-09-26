import { NextResponse } from "next/server";
import { isAdminResponse, requireAdminResponse } from "@/lib/admin/guard";

export async function readAdmin() {
  const admin = await requireAdminResponse();
  if (isAdminResponse(admin)) return { error: admin, user: null };
  return { error: null, user: admin.user };
}

export async function readJson(request: Request) {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function reasonFrom(body: Record<string, unknown> | null) {
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (reason.length < 3 || reason.length > 500) return null;
  return reason;
}

export function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}
