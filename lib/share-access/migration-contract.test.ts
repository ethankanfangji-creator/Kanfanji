import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const hardening = readFileSync(
  new URL("../../supabase/migrate-share-hardening.sql", import.meta.url),
  "utf8",
);
const forwardFix = readFileSync(
  new URL("../../supabase/migrate-share-resolution-forward-fix.sql", import.meta.url),
  "utf8",
);

describe("share migration contract", () => {
  it("bootstraps a missing table and freezes published content", () => {
    expect(hardening).toContain("create table if not exists public.share_links");
    expect(hardening).toContain("published_snapshot jsonb");
    expect(hardening).toContain("media_manifest jsonb");
    expect(hardening).toContain("published share snapshot is immutable");
    expect(hardening).toContain("v_old.published_snapshot");
    expect(hardening).toContain("v_old.media_manifest");
  });

  it("removes both legacy database resolver capabilities", () => {
    expect(hardening).toContain("drop function if exists public.resolve_share_link(text)");
    expect(hardening).toContain(
      "drop function if exists public.get_viewing_by_share_token(text)",
    );
    expect(hardening).not.toContain("grant execute on function public.resolve_share_link");
  });

  it("atomically mutates access versions and validates media association", () => {
    expect(forwardFix).toContain(
      "revoke all privileges on table public.share_links from public, anon, authenticated",
    );
    expect(forwardFix).toContain("for update of sl");
    expect(forwardFix).toContain("access_version = access_version");
    expect(forwardFix).toContain("p_expected_access_version");
    expect(forwardFix).toContain("v.user_id::text || '/' || v.id::text || '/photos/%'");
    expect(forwardFix).toContain("= any(v.photo_urls)");
    expect(forwardFix).toContain("grant execute on function public.resolve_share_publication");
    expect(forwardFix).toContain("to service_role");
  });
});
