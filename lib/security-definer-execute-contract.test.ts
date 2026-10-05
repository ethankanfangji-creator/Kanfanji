import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Security definer functions that anon or authenticated may execute.
 * Every other security definer function must not grant those roles execute.
 */
const CLIENT_EXECUTE_ALLOWLIST: Record<string, string> = {
  "public.get_viewing_by_share_token(text)":
    "A share token has to open one viewing without a logged-in session. The grant is limited to this lookup.",
  // Historical grants only — dropped by 20261005060000_drop_house_cards_discussion.sql
  "public.read_live_viewing(text)":
    "Legacy live card-session reader for the retired /live product; grants remain in old migrations only.",
  "public.viewing_has_active_session(uuid)":
    "Legacy helper for live card RLS on the retired viewing_cards table; grants remain in old migrations only.",
};

function sqlFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sqlFiles(path));
    else if (name.endsWith(".sql")) out.push(path);
  }
  return out;
}

function normalizeSignature(name: string, args: string) {
  const cleaned = args.replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").trim();
  return `${name}(${cleaned})`;
}

describe("security definer execute grants", () => {
  const files = sqlFiles(join(process.cwd(), "supabase"));
  const sql = files.map((file) => readFileSync(file, "utf8")).join("\n");

  it("names every client-executable function and why", () => {
    for (const [signature, reason] of Object.entries(CLIENT_EXECUTE_ALLOWLIST)) {
      expect(reason.trim().length).toBeGreaterThan(20);
      expect(sql).toContain(signature);
    }
  });

  it("does not grant anon or authenticated execute except the allowlist", () => {
    const grants = sql.matchAll(
      /grant execute on function (public\.[a-z0-9_]+)\(([\s\S]*?)\)\s*to\s+([^;]+);/gi,
    );
    const unexpected: string[] = [];
    for (const match of grants) {
      const signature = normalizeSignature(match[1], match[2]);
      const roles = match[3];
      if (!/\b(anon|authenticated)\b/.test(roles)) continue;
      if (CLIENT_EXECUTE_ALLOWLIST[signature]) continue;
      unexpected.push(`${signature} -> ${roles.trim()}`);
    }
    expect(unexpected).toEqual([]);
  });

  it("records the already-applied find_or_create_property revoke", () => {
    const revoke = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20260929044648_revoke_find_or_create_property_public_execute.sql",
      ),
      "utf8",
    );
    expect(revoke).toContain("Do not apply this file again");
    expect(revoke).toContain("from public, anon, authenticated");
    expect(revoke).toContain("to service_role");
    expect(revoke).not.toMatch(/to anon|to authenticated/);
  });
});
