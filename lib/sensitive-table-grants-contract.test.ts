import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrate-sensitive-table-least-privilege.sql", import.meta.url),
  "utf8",
);
const updateGrantFix = readFileSync(
  new URL("../supabase/migrate-viewing-update-grants-forward-fix.sql", import.meta.url),
  "utf8",
);
const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8");

describe("sensitive table least-privilege migration", () => {
  it("removes inherited and direct grants from every client role", () => {
    expect(migration).toContain("from public, anon, authenticated");
    for (const table of [
      "public.viewings",
      "public.properties",
      "public.subscriptions",
      "public.viewing_members",
      "public.viewing_invites",
      "public.viewing_comments",
      "public.viewing_audit_events",
    ]) {
      expect(migration).toContain(table);
      expect(migration).toContain(`alter table ${table} enable row level security`);
    }
  });

  it("allows only direct viewing sync and subscription reads", () => {
    expect(migration).toContain("grant insert (");
    expect(migration).toContain("grant update (");
    expect(migration).toContain("idempotency_key");
    expect(migration).toContain("revision");
    expect(migration).toContain("on table public.viewings to authenticated");
    expect(migration).toContain("on table public.subscriptions to authenticated");
    expect(migration).not.toContain("share_token");
    expect(migration).not.toMatch(
      /on table public\.(?:properties|viewing_members|viewing_invites|viewing_comments|viewing_audit_events) to authenticated/,
    );
    expect(updateGrantFix).toContain(
      "revoke update on table public.viewings from authenticated",
    );
    expect(updateGrantFix).not.toContain("idempotency_key");
    expect(updateGrantFix).not.toContain("is_pro");
    expect(updateGrantFix).not.toContain("property_id");
  });

  it("keeps the same client boundary in the fresh schema", () => {
    expect(schema).toContain(
      "revoke all privileges on table public.properties from public, anon, authenticated",
    );
    expect(schema).toContain(
      "revoke all privileges on table public.viewings from public, anon, authenticated",
    );
    expect(schema).toContain(
      "revoke all privileges on table public.subscriptions from public, anon, authenticated",
    );
    expect(schema).toContain(
      "grant select (user_id, status, plan) on table public.subscriptions to authenticated",
    );
    const viewingGrantBlock = schema.slice(
      schema.indexOf("revoke all privileges on table public.viewings"),
      schema.indexOf("create table if not exists public.share_links"),
    );
    expect(viewingGrantBlock).not.toContain("share_token");
  });
});

describe("admin backend grants", () => {
  const admin = readFileSync(
    new URL("../supabase/migrations/20260926043000_admin_backend.sql", import.meta.url),
    "utf8",
  );

  it("keeps the audit log and admin RPCs off client roles", () => {
    expect(admin).toContain("revoke all on public.admin_audit_log from public, anon, authenticated");
    expect(admin).toContain("grant select, insert on public.admin_audit_log to service_role");
    for (const name of [
      "admin_list_users",
      "admin_get_ai_usage",
      "admin_reset_ai_quota",
      "admin_set_manual_pro",
    ]) {
      expect(admin).toContain(`revoke all on function public.${name}`);
      expect(admin).toContain("from public, anon, authenticated");
      expect(admin).toContain(`grant execute on function public.${name}`);
    }
    expect(admin).toContain("to service_role");
  });
});
