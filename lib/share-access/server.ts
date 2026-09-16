import type { SupabaseClient } from "@supabase/supabase-js";
import { newShareToken } from "@/lib/media-paths";
import {
  generateShareToken,
  hashSharePassword,
  shareTokenFingerprint,
  verifySharePassword,
} from "./crypto";
import {
  isShareAccessState,
  newShareAccessState,
  type ShareAccessState,
} from "./state";
import type { ShareLinkRecord } from "./types";
import { resolveShareLinkGate } from "./public-dto";

export type ViewingShareRow = {
  id: string;
  user_id: string;
  address: string;
  tags: string[] | null;
  pros: string[] | null;
  risks: string[] | null;
  photo_urls: string[] | null;
  share_token: string | null;
  property: Record<string, unknown> | null;
  updated_at: string;
  created_at: string;
};

function readAccess(property: Record<string, unknown> | null | undefined): ShareAccessState | null {
  const raw = property?.shareAccess;
  return isShareAccessState(raw) ? raw : null;
}

function withAccess(
  property: Record<string, unknown> | null | undefined,
  access: ShareAccessState,
): Record<string, unknown> {
  return {
    ...(property ?? {}),
    shareAccess: access,
  };
}

export function toShareLinkRecord(
  viewingId: string,
  token: string | null,
  access: ShareAccessState,
): ShareLinkRecord {
  const expired =
    access.expiresAt && new Date(access.expiresAt).getTime() <= Date.now();
  const status = access.status === "revoked" ? "revoked" : expired ? "expired" : "active";
  return {
    id: access.linkId,
    viewingId,
    token: token || "",
    capability: "read",
    status,
    expiresAt: access.expiresAt,
    passwordEnabled: Boolean(access.passwordHash),
    createdAt: access.createdAt,
    updatedAt: access.updatedAt,
    revokedAt: access.revokedAt,
    lastResolvedAt: access.lastResolvedAt,
  };
}

export async function shareLinksTableAvailable(
  admin: SupabaseClient,
): Promise<boolean> {
  const { error } = await admin.from("share_links").select("id").limit(1);
  return !error;
}

async function fetchOwnedViewing(
  supabase: SupabaseClient,
  userId: string,
  viewingId: string,
): Promise<ViewingShareRow | null> {
  const { data, error } = await supabase
    .from("viewings")
    .select(
      "id, user_id, address, tags, pros, risks, photo_urls, share_token, property, updated_at, created_at",
    )
    .eq("id", viewingId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data as ViewingShareRow;
}

export async function getOwnerShareLink(
  supabase: SupabaseClient,
  userId: string,
  viewingId: string,
): Promise<{ link: ShareLinkRecord | null; viewing: ViewingShareRow | null }> {
  const viewing = await fetchOwnedViewing(supabase, userId, viewingId);
  if (!viewing) return { link: null, viewing: null };
  const access = readAccess(viewing.property);
  if (!access && !viewing.share_token) return { link: null, viewing };
  const state = access ?? newShareAccessState();
  return {
    link: toShareLinkRecord(viewing.id, viewing.share_token, state),
    viewing,
  };
}

export async function ensureOwnerShareLink(
  supabase: SupabaseClient,
  userId: string,
  viewingId: string,
  options?: {
    expiresAt?: string | null;
    password?: string | null;
    rotateToken?: boolean;
  },
): Promise<{ link: ShareLinkRecord; urlPath: string }> {
  const viewing = await fetchOwnedViewing(supabase, userId, viewingId);
  if (!viewing) throw new Error("VIEWING_NOT_FOUND");

  const now = new Date().toISOString();
  let access = readAccess(viewing.property) ?? newShareAccessState();
  let token = viewing.share_token;

  if (options?.rotateToken || !token || access.status === "revoked") {
    token = generateShareToken();
    access = {
      ...access,
      status: "active",
      revokedAt: null,
      updatedAt: now,
      createdAt: access.status === "revoked" ? now : access.createdAt,
    };
  }

  if (options && "expiresAt" in (options ?? {})) {
    access = { ...access, expiresAt: options.expiresAt ?? null, updatedAt: now };
  }
  if (options && "password" in (options ?? {})) {
    const password = options.password;
    access = {
      ...access,
      passwordHash:
        password == null || password === ""
          ? null
          : await hashSharePassword(password),
      updatedAt: now,
    };
  }

  access = { ...access, status: "active", updatedAt: now };

  const property = withAccess(viewing.property, access);
  const { error } = await supabase
    .from("viewings")
    .update({
      share_token: token,
      property,
      updated_at: now,
    })
    .eq("id", viewingId)
    .eq("user_id", userId);
  if (error) throw error;

  // Best-effort mirror into share_links when migration is applied.
  try {
    if (await shareLinksTableAvailable(supabase)) {
      await supabase.from("share_links").upsert(
        {
          id: access.linkId,
          viewing_id: viewingId,
          token,
          capability: "read",
          status: "active",
          expires_at: access.expiresAt,
          password_hash: access.passwordHash,
          created_at: access.createdAt,
          updated_at: access.updatedAt,
          revoked_at: null,
        },
        { onConflict: "id" },
      );
    }
  } catch {
    // optional table
  }

  return {
    link: toShareLinkRecord(viewingId, token, access),
    urlPath: `/s/${token}`,
  };
}

export async function updateOwnerShareLink(
  supabase: SupabaseClient,
  userId: string,
  linkId: string,
  patch: { expiresAt?: string | null; password?: string | null },
): Promise<ShareLinkRecord> {
  const { data: rows, error } = await supabase
    .from("viewings")
    .select(
      "id, user_id, address, tags, pros, risks, photo_urls, share_token, property, updated_at, created_at",
    )
    .eq("user_id", userId);
  if (error) throw error;

  const viewing = ((rows ?? []) as ViewingShareRow[]).find((row) => {
    const access = readAccess(row.property);
    return access?.linkId === linkId || (!access && row.id === linkId);
  });
  if (!viewing) throw new Error("LINK_NOT_FOUND");

  return (
    await ensureOwnerShareLink(supabase, userId, viewing.id, {
      expiresAt: patch.expiresAt,
      password: patch.password,
    })
  ).link;
}

export async function revokeOwnerShareLink(
  supabase: SupabaseClient,
  userId: string,
  linkId: string,
): Promise<ShareLinkRecord> {
  const { data: rows, error } = await supabase
    .from("viewings")
    .select(
      "id, user_id, address, tags, pros, risks, photo_urls, share_token, property, updated_at, created_at",
    )
    .eq("user_id", userId);
  if (error) throw error;

  const viewing = ((rows ?? []) as ViewingShareRow[]).find((row) => {
    const access = readAccess(row.property);
    return access?.linkId === linkId;
  });
  if (!viewing) throw new Error("LINK_NOT_FOUND");

  const now = new Date().toISOString();
  const prev = readAccess(viewing.property) ?? newShareAccessState({ linkId });
  const access: ShareAccessState = {
    ...prev,
    status: "revoked",
    revokedAt: now,
    updatedAt: now,
  };
  const property = withAccess(viewing.property, access);
  const { error: updErr } = await supabase
    .from("viewings")
    .update({
      share_token: null,
      property,
      updated_at: now,
    })
    .eq("id", viewing.id)
    .eq("user_id", userId);
  if (updErr) throw updErr;

  try {
    if (await shareLinksTableAvailable(supabase)) {
      await supabase
        .from("share_links")
        .update({
          status: "revoked",
          revoked_at: now,
          updated_at: now,
          token: `revoked_${shareTokenFingerprint(viewing.share_token || linkId)}_${Date.now()}`,
        })
        .eq("id", linkId);
    }
  } catch {
    // optional
  }

  return toShareLinkRecord(viewing.id, null, access);
}

export async function rotateOwnerShareLink(
  supabase: SupabaseClient,
  userId: string,
  linkId: string,
): Promise<{ link: ShareLinkRecord; urlPath: string }> {
  const { data: rows, error } = await supabase
    .from("viewings")
    .select(
      "id, user_id, share_token, property",
    )
    .eq("user_id", userId);
  if (error) throw error;
  const viewing = ((rows ?? []) as Pick<ViewingShareRow, "id" | "share_token" | "property">[]).find(
    (row) => readAccess(row.property)?.linkId === linkId,
  );
  if (!viewing) throw new Error("LINK_NOT_FOUND");
  return ensureOwnerShareLink(supabase, userId, viewing.id, { rotateToken: true });
}

export async function fetchViewingByShareTokenAdmin(
  admin: SupabaseClient,
  token: string,
): Promise<ViewingShareRow | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;

  // Prefer share_links when present.
  try {
    if (await shareLinksTableAvailable(admin)) {
      const { data: link } = await admin
        .from("share_links")
        .select(
          "id, viewing_id, token, status, expires_at, password_hash, revoked_at, last_resolved_at, created_at, updated_at",
        )
        .eq("token", trimmed)
        .maybeSingle();
      if (link) {
        const { data: viewing } = await admin
          .from("viewings")
          .select(
            "id, user_id, address, tags, pros, risks, photo_urls, share_token, property, updated_at, created_at",
          )
          .eq("id", link.viewing_id)
          .maybeSingle();
        if (!viewing) return null;
        const row = viewing as ViewingShareRow;
        const access = newShareAccessState({
          linkId: String(link.id),
          status: link.status === "revoked" ? "revoked" : "active",
          expiresAt: link.expires_at ? String(link.expires_at) : null,
          passwordHash: link.password_hash ? String(link.password_hash) : null,
          revokedAt: link.revoked_at ? String(link.revoked_at) : null,
          lastResolvedAt: link.last_resolved_at
            ? String(link.last_resolved_at)
            : null,
          createdAt: String(link.created_at),
          updatedAt: String(link.updated_at),
        });
        return {
          ...row,
          share_token: trimmed,
          property: withAccess(row.property, access),
        };
      }
    }
  } catch {
    // fall through
  }

  const { data, error } = await admin
    .from("viewings")
    .select(
      "id, user_id, address, tags, pros, risks, photo_urls, share_token, property, updated_at, created_at",
    )
    .eq("share_token", trimmed)
    .maybeSingle();
  if (error || !data) return null;
  return data as ViewingShareRow;
}

export async function touchShareResolved(
  admin: SupabaseClient,
  viewing: ViewingShareRow,
): Promise<void> {
  const access = readAccess(viewing.property);
  if (!access) return;
  const now = new Date().toISOString();
  const next = { ...access, lastResolvedAt: now, updatedAt: access.updatedAt };
  await admin
    .from("viewings")
    .update({ property: withAccess(viewing.property, next) })
    .eq("id", viewing.id);
  try {
    if (await shareLinksTableAvailable(admin)) {
      await admin
        .from("share_links")
        .update({ last_resolved_at: now })
        .eq("id", access.linkId);
    }
  } catch {
    // optional
  }
}

export function gateFromViewing(
  viewing: ViewingShareRow | null,
  unlocked: boolean,
): ReturnType<typeof resolveShareLinkGate> {
  if (!viewing) return "missing";
  const access = readAccess(viewing.property);
  return resolveShareLinkGate({
    found: true,
    revokedAt: access?.status === "revoked" ? access.revokedAt || access.updatedAt : null,
    expiresAt: access?.expiresAt ?? null,
    passwordHash: access?.passwordHash ?? null,
    unlocked,
  });
}

export async function verifyViewingSharePassword(
  viewing: ViewingShareRow,
  password: string,
): Promise<boolean> {
  const hash = readAccess(viewing.property)?.passwordHash;
  if (!hash) return true;
  return verifySharePassword(password, hash);
}

export function getShareAccess(viewing: ViewingShareRow): ShareAccessState | null {
  return readAccess(viewing.property);
}

/** Ensure newly synced viewings have shareAccess metadata without wiping token. */
export function ensureShareAccessOnProperty(
  property: Record<string, unknown>,
  shareToken: string | null,
): Record<string, unknown> {
  if (!shareToken) return property;
  if (isShareAccessState(property.shareAccess)) return property;
  return withAccess(property, newShareAccessState());
}

export { newShareToken };
