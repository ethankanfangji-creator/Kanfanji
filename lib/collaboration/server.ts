import { createHash, randomBytes } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/utils/supabase/admin";
import type {
  CollaborationOverview,
  MemberRole,
  ViewingComment,
  ViewingInvite,
  ViewingMember,
  ViewingRole,
} from "./types";
import { roleAtLeast } from "./types";

const MEMBER_SELECT =
  "id, viewing_id, user_id, role, status, created_at, updated_at, revoked_at";
const INVITE_SELECT =
  "id, viewing_id, email, role, status, expires_at, created_at, accepted_at, revoked_at";
const COMMENT_SELECT =
  "id, viewing_id, author_id, body, anchor, created_at, updated_at, deleted_at";

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const [local, domain] = email.split("@");
  if (!domain) return null;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(1, local.length - visible.length))}@${domain}`;
}

async function audit(
  viewingId: string,
  actorId: string | null,
  action: string,
  meta: Record<string, unknown> = {},
) {
  const admin = createAdminClient();
  await admin.from("viewing_audit_events").insert({
    viewing_id: viewingId,
    actor_id: actorId,
    action,
    meta,
  });
}

export async function getViewingRole(
  viewingId: string,
  userId: string,
): Promise<ViewingRole | null> {
  const admin = createAdminClient();
  const { data: viewing } = await admin
    .from("viewings")
    .select("user_id")
    .eq("id", viewingId)
    .maybeSingle();
  if (!viewing) return null;
  if (viewing.user_id === userId) return "owner";

  const { data: member } = await admin
    .from("viewing_members")
    .select("role")
    .eq("viewing_id", viewingId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  return (member?.role as ViewingRole | undefined) ?? null;
}

export async function requireViewingRole(
  viewingId: string,
  userId: string,
  minimum: ViewingRole,
): Promise<ViewingRole> {
  const role = await getViewingRole(viewingId, userId);
  if (!role || !roleAtLeast(role, minimum)) {
    throw new Error("FORBIDDEN");
  }
  return role;
}

function toMember(row: Record<string, unknown>, email?: string | null): ViewingMember {
  return {
    id: String(row.id),
    viewingId: String(row.viewing_id),
    userId: String(row.user_id),
    role: row.role as MemberRole,
    status: row.status as ViewingMember["status"],
    displayEmail: maskEmail(email),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    revokedAt: row.revoked_at ? String(row.revoked_at) : null,
  };
}

function toInvite(row: Record<string, unknown>): ViewingInvite {
  const expiresAt = String(row.expires_at);
  const status =
    row.status === "pending" && Date.parse(expiresAt) <= Date.now()
      ? "expired"
      : (row.status as ViewingInvite["status"]);
  return {
    id: String(row.id),
    viewingId: String(row.viewing_id),
    email: String(row.email),
    role: row.role as MemberRole,
    status,
    expiresAt,
    createdAt: String(row.created_at),
    acceptedAt: row.accepted_at ? String(row.accepted_at) : null,
    revokedAt: row.revoked_at ? String(row.revoked_at) : null,
  };
}

function toComment(
  row: Record<string, unknown>,
  authorLabel: string,
): ViewingComment {
  return {
    id: String(row.id),
    viewingId: String(row.viewing_id),
    authorId: String(row.author_id),
    authorLabel,
    body: String(row.body),
    anchor:
      row.anchor && typeof row.anchor === "object"
        ? (row.anchor as Record<string, unknown>)
        : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

async function emailMap(userIds: string[]): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  if (userIds.length === 0) return result;
  const admin = createAdminClient();
  // Family groups are intentionally small; avoid exposing full auth rows.
  await Promise.all(
    userIds.map(async (id) => {
      const { data } = await admin.auth.admin.getUserById(id);
      result.set(id, data.user?.email ?? null);
    }),
  );
  return result;
}

export async function getCollaborationOverview(
  viewingId: string,
  user: User,
): Promise<CollaborationOverview> {
  const role = await requireViewingRole(viewingId, user.id, "viewer");
  const admin = createAdminClient();
  const [{ data: viewing }, { data: memberRows }, { data: commentRows }] =
    await Promise.all([
      admin.from("viewings").select("revision").eq("id", viewingId).single(),
      admin
        .from("viewing_members")
        .select(MEMBER_SELECT)
        .eq("viewing_id", viewingId)
        .order("created_at"),
      admin
        .from("viewing_comments")
        .select(COMMENT_SELECT)
        .eq("viewing_id", viewingId)
        .is("deleted_at", null)
        .order("created_at"),
    ]);

  const invitesPromise =
    role === "owner"
      ? admin
          .from("viewing_invites")
          .select(INVITE_SELECT)
          .eq("viewing_id", viewingId)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as Record<string, unknown>[] });
  const { data: inviteRows } = await invitesPromise;

  const ids = new Set<string>([
    ...(memberRows ?? []).map((row) => String(row.user_id)),
    ...(commentRows ?? []).map((row) => String(row.author_id)),
  ]);
  const emails = await emailMap([...ids]);

  return {
    role,
    revision: Number(viewing?.revision ?? 1),
    members: (memberRows ?? []).map((row) =>
      toMember(row, role === "owner" ? emails.get(String(row.user_id)) : null),
    ),
    invites: (inviteRows ?? []).map(toInvite),
    comments: (commentRows ?? []).map((row) =>
      toComment(row, maskEmail(emails.get(String(row.author_id))) ?? "家人"),
    ),
  };
}

export async function createViewingInvite(input: {
  viewingId: string;
  actor: User;
  email: string;
  role: MemberRole;
  expiresAt?: string | null;
}): Promise<{ invite: ViewingInvite; token: string }> {
  await requireViewingRole(input.viewingId, input.actor.id, "owner");
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) throw new Error("INVALID_EMAIL");
  if (!["viewer", "commenter", "editor"].includes(input.role)) {
    throw new Error("INVALID_ROLE");
  }

  const admin = createAdminClient();
  const token = randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = input.expiresAt
    ? new Date(input.expiresAt)
    : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt <= now) {
    throw new Error("INVALID_EXPIRY");
  }

  await admin
    .from("viewing_invites")
    .update({
      status: "revoked",
      revoked_at: now.toISOString(),
    })
    .eq("viewing_id", input.viewingId)
    .eq("email", email)
    .eq("status", "pending");

  const { data, error } = await admin
    .from("viewing_invites")
    .insert({
      viewing_id: input.viewingId,
      email,
      role: input.role,
      token_hash: tokenHash(token),
      status: "pending",
      invited_by: input.actor.id,
      expires_at: expiresAt.toISOString(),
    })
    .select(INVITE_SELECT)
    .single();
  if (error || !data) throw error ?? new Error("INVITE_CREATE_FAILED");

  await audit(input.viewingId, input.actor.id, "invite.create", {
    inviteId: data.id,
    role: input.role,
    emailDomain: email.split("@")[1],
  });
  return { invite: toInvite(data), token };
}

export async function acceptViewingInvite(
  rawToken: string,
  user: User,
): Promise<{ viewingId: string; role: MemberRole }> {
  const email = user.email?.trim().toLowerCase();
  if (!email) throw new Error("EMAIL_REQUIRED");
  const admin = createAdminClient();
  const { data: invite, error } = await admin
    .from("viewing_invites")
    .select(`${INVITE_SELECT}, token_hash`)
    .eq("token_hash", tokenHash(rawToken.trim()))
    .maybeSingle();
  if (error || !invite) throw new Error("INVITE_NOT_FOUND");
  if (invite.status !== "pending") throw new Error("INVITE_UNAVAILABLE");
  if (Date.parse(String(invite.expires_at)) <= Date.now()) {
    await admin
      .from("viewing_invites")
      .update({ status: "expired" })
      .eq("id", invite.id);
    throw new Error("INVITE_EXPIRED");
  }
  if (String(invite.email).toLowerCase() !== email) {
    throw new Error("INVITE_EMAIL_MISMATCH");
  }

  const now = new Date().toISOString();
  const role = invite.role as MemberRole;
  const { error: memberError } = await admin.from("viewing_members").upsert(
    {
      viewing_id: invite.viewing_id,
      user_id: user.id,
      role,
      status: "active",
      updated_at: now,
      revoked_at: null,
    },
    { onConflict: "viewing_id,user_id" },
  );
  if (memberError) throw memberError;
  await admin
    .from("viewing_invites")
    .update({ status: "accepted", accepted_at: now })
    .eq("id", invite.id);
  await audit(String(invite.viewing_id), user.id, "invite.accept", {
    inviteId: invite.id,
    role,
  });
  return { viewingId: String(invite.viewing_id), role };
}

export async function updateViewingMember(input: {
  viewingId: string;
  memberId: string;
  actor: User;
  role: MemberRole;
}): Promise<ViewingMember> {
  await requireViewingRole(input.viewingId, input.actor.id, "owner");
  if (!["viewer", "commenter", "editor"].includes(input.role)) {
    throw new Error("INVALID_ROLE");
  }
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("viewing_members")
    .update({ role: input.role, updated_at: now })
    .eq("id", input.memberId)
    .eq("viewing_id", input.viewingId)
    .eq("status", "active")
    .select(MEMBER_SELECT)
    .maybeSingle();
  if (error || !data) throw error ?? new Error("MEMBER_NOT_FOUND");
  await audit(input.viewingId, input.actor.id, "member.role_change", {
    memberId: input.memberId,
    role: input.role,
  });
  return toMember(data);
}

export async function revokeViewingMember(input: {
  viewingId: string;
  memberId: string;
  actor: User;
}): Promise<void> {
  await requireViewingRole(input.viewingId, input.actor.id, "owner");
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("viewing_members")
    .update({ status: "revoked", revoked_at: now, updated_at: now })
    .eq("id", input.memberId)
    .eq("viewing_id", input.viewingId)
    .eq("status", "active")
    .select("id")
    .maybeSingle();
  if (error || !data) throw error ?? new Error("MEMBER_NOT_FOUND");
  await audit(input.viewingId, input.actor.id, "member.revoke", {
    memberId: input.memberId,
  });
}

export async function revokeViewingInvite(input: {
  viewingId: string;
  inviteId: string;
  actor: User;
}): Promise<void> {
  await requireViewingRole(input.viewingId, input.actor.id, "owner");
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("viewing_invites")
    .update({ status: "revoked", revoked_at: now })
    .eq("id", input.inviteId)
    .eq("viewing_id", input.viewingId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error || !data) throw error ?? new Error("INVITE_NOT_FOUND");
  await audit(input.viewingId, input.actor.id, "invite.revoke", {
    inviteId: input.inviteId,
  });
}

export async function addViewingComment(input: {
  viewingId: string;
  actor: User;
  body: string;
  anchor?: Record<string, unknown> | null;
}): Promise<ViewingComment> {
  await requireViewingRole(input.viewingId, input.actor.id, "commenter");
  const body = input.body.trim();
  if (!body || body.length > 4000) throw new Error("INVALID_COMMENT");
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("viewing_comments")
    .insert({
      viewing_id: input.viewingId,
      author_id: input.actor.id,
      body,
      anchor: input.anchor ?? null,
    })
    .select(COMMENT_SELECT)
    .single();
  if (error || !data) throw error ?? new Error("COMMENT_CREATE_FAILED");
  await audit(input.viewingId, input.actor.id, "comment.create", {
    commentId: data.id,
  });
  return toComment(data, maskEmail(input.actor.email) ?? "家人");
}

const EDITABLE_VIEWING_KEYS = [
  "address",
  "tags",
  "market",
  "questions",
  "notes",
  "pros",
  "risks",
  "property",
] as const;

export async function updateViewingWithRevision(input: {
  viewingId: string;
  actor: User;
  expectedRevision: number;
  patch: Record<string, unknown>;
}): Promise<{ revision: number; updatedAt: string }> {
  const actorRole = await requireViewingRole(
    input.viewingId,
    input.actor.id,
    "editor",
  );
  if (
    !Number.isInteger(input.expectedRevision) ||
    input.expectedRevision < 1
  ) {
    throw new Error("INVALID_REVISION");
  }

  const safePatch: Record<string, unknown> = {};
  for (const key of EDITABLE_VIEWING_KEYS) {
    if (key in input.patch) safePatch[key] = input.patch[key];
  }
  if (Object.keys(safePatch).length === 0) {
    throw new Error("EMPTY_PATCH");
  }

  const admin = createAdminClient();
  if (actorRole === "editor" && "property" in safePatch) {
    const incoming = safePatch.property;
    if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
      throw new Error("INVALID_PROPERTY");
    }
    const { data: current } = await admin
      .from("viewings")
      .select("property")
      .eq("id", input.viewingId)
      .single();
    const currentProperty =
      current?.property &&
      typeof current.property === "object" &&
      !Array.isArray(current.property)
        ? (current.property as Record<string, unknown>)
        : {};
    const editableProperty = {
      ...(incoming as Record<string, unknown>),
    };
    delete editableProperty.shareAccess;
    safePatch.property = Object.prototype.hasOwnProperty.call(
      currentProperty,
      "shareAccess",
    )
      ? { ...editableProperty, shareAccess: currentProperty.shareAccess }
      : editableProperty;
  }
  const nextRevision = input.expectedRevision + 1;
  const updatedAt = new Date().toISOString();
  const { data, error } = await admin
    .from("viewings")
    .update({
      ...safePatch,
      revision: nextRevision,
      updated_at: updatedAt,
    })
    .eq("id", input.viewingId)
    .eq("revision", input.expectedRevision)
    .select("revision, updated_at")
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const { data: latest } = await admin
      .from("viewings")
      .select("revision, updated_at")
      .eq("id", input.viewingId)
      .maybeSingle();
    const conflict = new Error("REVISION_CONFLICT") as Error & {
      latest?: Record<string, unknown> | null;
    };
    conflict.latest = latest;
    throw conflict;
  }

  await audit(input.viewingId, input.actor.id, "viewing.update", {
    fromRevision: input.expectedRevision,
    toRevision: nextRevision,
    fields: Object.keys(safePatch),
  });
  return {
    revision: Number(data.revision),
    updatedAt: String(data.updated_at),
  };
}

export async function appendViewingMediaPath(input: {
  viewingId: string;
  actor: User;
  column: "photo_urls" | "video_urls" | "audio_urls";
  path: string;
}): Promise<{ revision: number; alreadyExisted: boolean }> {
  await requireViewingRole(input.viewingId, input.actor.id, "editor");
  const path = input.path.trim();
  if (!path || path.length > 2048) throw new Error("INVALID_MEDIA_PATH");
  const segments = path.split("/");
  if (
    segments.length < 4 ||
    segments[1] !== input.viewingId ||
    !["photos", "videos", "audios"].includes(segments[2])
  ) {
    throw new Error("INVALID_MEDIA_PATH");
  }

  const expectedFolder = {
    photo_urls: "photos",
    video_urls: "videos",
    audio_urls: "audios",
  }[input.column];
  if (segments[2] !== expectedFolder) throw new Error("INVALID_MEDIA_PATH");

  const admin = createAdminClient();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: current, error: readError } = await admin
      .from("viewings")
      .select(`${input.column}, revision`)
      .eq("id", input.viewingId)
      .single();
    if (readError || !current) throw readError ?? new Error("VIEWING_NOT_FOUND");
    const currentRow = current as unknown as Record<string, unknown>;
    const paths = Array.isArray(currentRow[input.column])
      ? (currentRow[input.column] as string[])
      : [];
    const revision = Number(current.revision ?? 1);
    if (paths.includes(path)) return { revision, alreadyExisted: true };

    const { data: updated, error: updateError } = await admin
      .from("viewings")
      .update({
        [input.column]: [...paths, path],
        revision: revision + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.viewingId)
      .eq("revision", revision)
      .select("revision")
      .maybeSingle();
    if (updateError) throw updateError;
    if (updated) {
      await audit(input.viewingId, input.actor.id, "media.append", {
        column: input.column,
        fromRevision: revision,
        toRevision: revision + 1,
      });
      return { revision: Number(updated.revision), alreadyExisted: false };
    }
  }
  throw new Error("REVISION_CONFLICT");
}

