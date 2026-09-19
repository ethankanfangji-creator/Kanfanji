import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const MEDIA_BUCKET = "viewing-media";
const USER_ROLES = ["owner", "editor", "commenter", "viewer", "revoked"];
const RUN_ID = `kf-smoke-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`;

function requiredEnv(...names) {
  const match = names.find((name) => process.env[name]?.trim());
  if (!match) {
    throw new Error(`Missing required environment variable: ${names.join(" or ")}`);
  }
  return process.env[match].trim();
}

const supabaseUrl = requiredEnv("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
const publishableKey = requiredEnv(
  "SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
);
const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const appUrl = requiredEnv("SUPABASE_SMOKE_APP_URL", "NEXT_PUBLIC_SITE_URL").replace(
  /\/+$/,
  "",
);

if (Number(process.versions.node.split(".")[0]) < 22) {
  throw new Error("Node 22 or newer is required by the current Supabase JavaScript SDK");
}
if (new URL(appUrl).origin === new URL(supabaseUrl).origin) {
  throw new Error("SUPABASE_SMOKE_APP_URL must be the deployed application URL");
}

const clientOptions = {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false,
  },
};
const admin = createClient(supabaseUrl, serviceRoleKey, clientOptions);
const anonymous = createClient(supabaseUrl, publishableKey, clientOptions);
const createdUserIds = [];
const clients = new Map();
const sessions = new Map();
const intendedStoragePaths = new Set();
let fixtureViewingId = null;
let fixtureOwnerId = null;

function pass(label) {
  console.log(`PASS ${label}`);
}

function safeError(error) {
  return error instanceof Error ? error.message : String(error);
}

function assertNoError(error, context) {
  if (error) throw new Error(`${context}: ${error.message}`);
}

function assertDeniedResult(result, context) {
  if (result.error) {
    assert.ok(
      ["42501", "PGRST301"].includes(result.error.code),
      `${context}: unexpected error ${result.error.code ?? "without a code"}`,
    );
    return;
  }
  assert.equal(
    result.data?.length ?? 0,
    0,
    `${context}: expected an error or zero visible rows`,
  );
}

async function createConfirmedUser(role, password) {
  const email = `${RUN_ID}-${role}@example.invalid`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { smoke_run_id: RUN_ID, smoke_role: role },
  });
  assertNoError(error, `create ${role} user`);
  assert.ok(data.user?.id, `create ${role} user returned no ID`);
  createdUserIds.push(data.user.id);

  const client = createClient(supabaseUrl, publishableKey, clientOptions);
  const { data: signInData, error: signInError } =
    await client.auth.signInWithPassword({ email, password });
  assertNoError(signInError, `sign in ${role}`);
  assert.ok(signInData.session, `sign in ${role} returned no session`);
  assert.ok(signInData.user.email_confirmed_at, `${role} email is not confirmed`);
  clients.set(role, client);
  sessions.set(role, signInData.session);
  return data.user.id;
}

function createSessionCookie(session) {
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  assert.ok(projectRef, "could not derive Supabase project reference");
  const cookieName = `sb-${projectRef}-auth-token`;
  const encoded = `base64-${Buffer.from(JSON.stringify(session), "utf8").toString(
    "base64url",
  )}`;
  const chunks = [];
  for (let offset = 0; offset < encoded.length; offset += 3180) {
    chunks.push(encoded.slice(offset, offset + 3180));
  }
  if (chunks.length === 1) return `${cookieName}=${chunks[0]}`;
  return chunks.map((value, index) => `${cookieName}.${index}=${value}`).join("; ");
}

async function appRequest(role, path, init = {}) {
  const session = sessions.get(role);
  assert.ok(session, `missing ${role} session`);
  return fetch(`${appUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      cookie: createSessionCookie(session),
      ...init.headers,
    },
    redirect: "error",
  });
}

async function assertViewingVisible(role, viewingId = fixtureViewingId) {
  const client = clients.get(role);
  const { data, error } = await client
    .from("viewings")
    .select("id, user_id, revision, address, photo_urls, video_urls")
    .eq("id", viewingId);
  assertNoError(error, `${role} viewing visibility`);
  assert.equal(data.length, 1, `${role} should see the fixture viewing`);
}

async function updateViewing(role, expectedRevision, address) {
  const client = clients.get(role);
  return client
    .from("viewings")
    .update({
      address,
      revision: expectedRevision + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", fixtureViewingId)
    .eq("revision", expectedRevision)
    .select("id, revision, address");
}

async function upload(role, path, contentType) {
  intendedStoragePaths.add(path);
  return clients
    .get(role)
    .storage.from(MEDIA_BUCKET)
    .upload(path, Buffer.from(`${RUN_ID}:${role}`), { contentType, upsert: false });
}

async function assertCanDownload(role, path) {
  const { data, error } = await clients
    .get(role)
    .storage.from(MEDIA_BUCKET)
    .download(path);
  assertNoError(error, `${role} download`);
  assert.ok(data, `${role} download returned no body`);
}

async function assertCannotDownload(client, label, path) {
  const { data, error } = await client.storage
    .from(MEDIA_BUCKET)
    .download(path);
  assert.ok(error, `${label} unexpectedly downloaded a private object`);
  assert.ok(
    ["400", "401", "403", "404"].includes(String(error.statusCode)),
    `${label} failed for a non-policy reason`,
  );
  assert.equal(data, null);
}

async function exerciseSmoke() {
  console.log(`Supabase integration smoke run: ${RUN_ID}`);

  const passwords = new Map(
    USER_ROLES.map((role) => [
      role,
      `${randomBytes(24).toString("base64url")}Aa1!`,
    ]),
  );
  const userIds = {};
  for (const role of USER_ROLES) {
    userIds[role] = await createConfirmedUser(role, passwords.get(role));
  }
  fixtureOwnerId = userIds.owner;
  pass("created isolated confirmed users");

  const { data: viewing, error: viewingError } = await admin
    .from("viewings")
    .insert({
      user_id: userIds.owner,
      idempotency_key: RUN_ID,
      address: `${RUN_ID} fixture`,
      tags: [RUN_ID],
      revision: 1,
    })
    .select("id")
    .single();
  assertNoError(viewingError, "create fixture viewing");
  fixtureViewingId = viewing.id;

  const { error: membersError } = await admin.from("viewing_members").insert([
    {
      viewing_id: fixtureViewingId,
      user_id: userIds.editor,
      role: "editor",
      status: "active",
    },
    {
      viewing_id: fixtureViewingId,
      user_id: userIds.commenter,
      role: "commenter",
      status: "active",
    },
    {
      viewing_id: fixtureViewingId,
      user_id: userIds.viewer,
      role: "viewer",
      status: "active",
    },
    {
      viewing_id: fixtureViewingId,
      user_id: userIds.revoked,
      role: "viewer",
      status: "revoked",
      revoked_at: new Date().toISOString(),
    },
  ]);
  assertNoError(membersError, "create fixture memberships");

  const { error: shareError } = await admin.from("share_links").insert({
    viewing_id: fixtureViewingId,
    token: randomBytes(32).toString("hex"),
    published_snapshot: { runId: RUN_ID },
    media_manifest: [],
  });
  assertNoError(shareError, "create fixture share link");
  pass("created service-role fixtures");

  for (const role of ["owner", "editor", "commenter", "viewer"]) {
    await assertViewingVisible(role);
  }
  const revokedRead = await clients
    .get("revoked")
    .from("viewings")
    .select("id")
    .eq("id", fixtureViewingId);
  assertDeniedResult(revokedRead, "revoked viewing read");
  const anonymousRead = await anonymous
    .from("viewings")
    .select("id")
    .eq("id", fixtureViewingId);
  assertDeniedResult(anonymousRead, "anonymous viewing read");
  pass("enforced viewing visibility");

  let revision = 1;
  const ownerUpdate = await updateViewing("owner", revision, `${RUN_ID} owner update`);
  assertNoError(ownerUpdate.error, "owner viewing update");
  assert.equal(ownerUpdate.data.length, 1);
  revision = ownerUpdate.data[0].revision;

  const editorUpdate = await updateViewing(
    "editor",
    revision,
    `${RUN_ID} editor update`,
  );
  assertNoError(editorUpdate.error, "editor viewing update");
  assert.equal(editorUpdate.data.length, 1);
  revision = editorUpdate.data[0].revision;

  for (const role of ["commenter", "viewer"]) {
    const deniedUpdate = await updateViewing(
      role,
      revision,
      `${RUN_ID} forbidden ${role} update`,
    );
    assertDeniedResult(deniedUpdate, `${role} viewing update`);
  }
  pass("enforced viewing update roles");

  const directComment = await clients.get("commenter").from("viewing_comments").insert({
    viewing_id: fixtureViewingId,
    author_id: userIds.commenter,
    body: `${RUN_ID} direct comment must fail`,
  });
  assert.equal(
    directComment.error?.code,
    "42501",
    "commenter should receive a privilege denial from viewing_comments",
  );

  const commentResponse = await appRequest(
    "commenter",
    `/api/viewings/${fixtureViewingId}/comments`,
    {
      method: "POST",
      body: JSON.stringify({ body: `${RUN_ID} API comment` }),
    },
  );
  assert.equal(commentResponse.status, 201, "commenter API comment should succeed");
  const viewerCommentResponse = await appRequest(
    "viewer",
    `/api/viewings/${fixtureViewingId}/comments`,
    {
      method: "POST",
      body: JSON.stringify({ body: `${RUN_ID} viewer comment must fail` }),
    },
  );
  assert.equal(viewerCommentResponse.status, 403, "viewer API comment should be denied");
  const { count: commentCount, error: commentVerifyError } = await admin
    .from("viewing_comments")
    .select("id", { count: "exact", head: true })
    .eq("viewing_id", fixtureViewingId)
    .eq("author_id", userIds.commenter);
  assertNoError(commentVerifyError, "verify API comment");
  assert.equal(commentCount, 1);
  pass("enforced API-only comment contract");

  const anonymousShare = await anonymous
    .from("share_links")
    .select("id")
    .eq("viewing_id", fixtureViewingId);
  assertDeniedResult(anonymousShare, "anonymous share_links read");
  pass("denied anonymous share_links access");

  const basePath = `${userIds.owner}/${fixtureViewingId}`;
  const paths = {
    photo: `${basePath}/photos/${RUN_ID}-photo.txt`,
    video: `${basePath}/videos/${RUN_ID}-video.txt`,
    audio: `${basePath}/audios/${RUN_ID}-audio.txt`,
    editor: `${basePath}/photos/${RUN_ID}-editor.txt`,
  };
  for (const [kind, contentType] of [
    ["photo", "image/jpeg"],
    ["video", "video/webm"],
    ["audio", "audio/webm"],
  ]) {
    const result = await upload("owner", paths[kind], contentType);
    assertNoError(result.error, `owner ${kind} upload`);
  }
  const editorUpload = await upload("editor", paths.editor, "image/jpeg");
  assertNoError(editorUpload.error, "editor upload");

  for (const path of Object.values(paths)) {
    await assertCanDownload("commenter", path);
  }
  await assertCanDownload("viewer", paths.photo);
  await assertCanDownload("viewer", paths.video);
  await assertCannotDownload(clients.get("viewer"), "viewer audio", paths.audio);
  await assertCannotDownload(clients.get("revoked"), "revoked", paths.photo);
  await assertCannotDownload(anonymous, "anonymous", paths.photo);
  pass("enforced Storage role matrix");

  const crossViewingId = randomUUID();
  const crossPath = `${userIds.owner}/${crossViewingId}/photos/${RUN_ID}-cross.txt`;
  intendedStoragePaths.add(crossPath);
  const { error: crossFixtureError } = await admin.storage
    .from(MEDIA_BUCKET)
    .upload(crossPath, Buffer.from(RUN_ID), {
      contentType: "image/jpeg",
      upsert: false,
    });
  assertNoError(crossFixtureError, "create cross-viewing storage fixture");
  await assertCannotDownload(clients.get("editor"), "cross-viewing editor", crossPath);
  const crossUploadPath = `${userIds.owner}/${crossViewingId}/photos/${RUN_ID}-cross-upload.txt`;
  intendedStoragePaths.add(crossUploadPath);
  const crossUpload = await upload("editor", crossUploadPath, "image/jpeg");
  assert.ok(crossUpload.error, "editor unexpectedly uploaded across viewing paths");
  assert.ok(
    ["400", "401", "403", "404"].includes(String(crossUpload.error.statusCode)),
    "cross-viewing upload failed for a non-policy reason",
  );
  pass("denied cross-viewing Storage paths");
}

async function cleanup() {
  const failures = [];
  const safePaths = [...intendedStoragePaths].filter((path) =>
    path.split("/").at(-1)?.startsWith(RUN_ID),
  );
  if (safePaths.length !== intendedStoragePaths.size) {
    failures.push("refused cleanup of a non-run-prefixed storage path");
  }
  if (safePaths.length > 0) {
    const { error } = await admin.storage.from(MEDIA_BUCKET).remove(safePaths);
    if (error) failures.push(`storage cleanup: ${error.message}`);
  }

  if (fixtureViewingId) {
    for (const table of [
      "viewing_comments",
      "share_links",
      "viewing_members",
      "viewing_invites",
      "viewing_audit_events",
    ]) {
      const { error } = await admin
        .from(table)
        .delete()
        .eq("viewing_id", fixtureViewingId);
      if (error) failures.push(`${table} cleanup: ${error.message}`);
    }
    let viewingDelete = admin.from("viewings").delete().eq("id", fixtureViewingId);
    if (fixtureOwnerId) viewingDelete = viewingDelete.eq("user_id", fixtureOwnerId);
    const { error } = await viewingDelete;
    if (error) failures.push(`viewings cleanup: ${error.message}`);
  }

  for (const userId of createdUserIds) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) failures.push(`created-user cleanup: ${error.message}`);
  }
  if (failures.length > 0) {
    throw new Error(failures.join("; "));
  }
  console.log(`CLEANUP complete for ${RUN_ID}`);
}

let smokeFailure = null;
try {
  await exerciseSmoke();
  console.log(`SUCCESS ${RUN_ID}`);
} catch (error) {
  smokeFailure = error;
  console.error(`FAIL ${RUN_ID}: ${safeError(error)}`);
} finally {
  try {
    await cleanup();
  } catch (error) {
    console.error(`CLEANUP FAILED ${RUN_ID}: ${safeError(error)}`);
    smokeFailure ??= error;
  }
}

if (smokeFailure) process.exitCode = 1;
