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

async function atomicMutation(
  operation: string,
  viewingId: string,
  actorId: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("mutate_viewing_with_audit", {
    p_operation: operation,
    p_viewing_id: viewingId,
    p_actor_id: actorId,
    p_payload: payload,
  });
  if (error) {
    const known = [
      "FORBIDDEN",
      "UNAUTHENTICATED",
      "INVALID_INVITE",
      "INVITE_UNAVAILABLE",
      "INVALID_ROLE",
      "MEMBER_NOT_FOUND",
      "INVITE_NOT_FOUND",
      "REVISION_CONFLICT",
    ].find((code) => error.message.includes(code));
    throw new Error(known ?? "ATOMIC_MUTATION_FAILED");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("ATOMIC_MUTATION_FAILED");
  }
  return data as Record<string, unknown>;
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

  const token = randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = input.expiresAt
    ? new Date(input.expiresAt)
    : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt <= now) {
    throw new Error("INVALID_EXPIRY");
  }

  const data = await atomicMutation("invite.create", input.viewingId, input.actor.id, {
    email,
    role: input.role,
    tokenHash: tokenHash(token),
    expiresAt: expiresAt.toISOString(),
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
    throw new Error("INVITE_EXPIRED");
  }
  if (String(invite.email).toLowerCase() !== email) {
    throw new Error("INVITE_EMAIL_MISMATCH");
  }

  const role = invite.role as MemberRole;
  await atomicMutation("invite.accept", String(invite.viewing_id), user.id, {
    inviteId: invite.id,
    email,
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
  const data = await atomicMutation(
    "member.role_change",
    input.viewingId,
    input.actor.id,
    {
    memberId: input.memberId,
    role: input.role,
    },
  );
  return toMember(data);
}

export async function revokeViewingMember(input: {
  viewingId: string;
  memberId: string;
  actor: User;
}): Promise<void> {
  await requireViewingRole(input.viewingId, input.actor.id, "owner");
  await atomicMutation("member.revoke", input.viewingId, input.actor.id, {
    memberId: input.memberId,
  });
}

export async function revokeViewingInvite(input: {
  viewingId: string;
  inviteId: string;
  actor: User;
}): Promise<void> {
  await requireViewingRole(input.viewingId, input.actor.id, "owner");
  await atomicMutation("invite.revoke", input.viewingId, input.actor.id, {
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
  const data = await atomicMutation(
    "comment.create",
    input.viewingId,
    input.actor.id,
    {
      body,
      anchor: input.anchor ?? null,
    },
  );
  if (!data.id) {
    throw new Error("COMMENT_CREATE_FAILED");
  }
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

  if (actorRole === "editor" && "property" in safePatch) {
    const incoming = safePatch.property;
    if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
      throw new Error("INVALID_PROPERTY");
    }
    const admin = createAdminClient();
    const { data: current, error: currentError } = await admin
      .from("viewings")
      .select("property")
      .eq("id", input.viewingId)
      .single();
    if (currentError) throw currentError;
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
  let data: Record<string, unknown>;
  try {
    data = await atomicMutation(
      "viewing.update",
      input.viewingId,
      input.actor.id,
      { ...safePatch, expectedRevision: input.expectedRevision },
    );
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "REVISION_CONFLICT") throw error;
    const admin = createAdminClient();
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

  const result = await atomicMutation(
    "media.append",
    input.viewingId,
    input.actor.id,
    { column: input.column, path },
  );
  return {
    revision: Number(result.revision),
    alreadyExisted: result.alreadyExisted === true,
  };
}

