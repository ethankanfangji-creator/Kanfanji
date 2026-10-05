import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const unitMigration = readFileSync(
  new URL(
    "../supabase/migrations/20261005010000_properties_unit_identity.sql",
    import.meta.url,
  ),
  "utf8",
);
const schema = readFileSync(
  new URL("../supabase/schema.sql", import.meta.url),
  "utf8",
);
const advisorMigration = readFileSync(
  new URL("../supabase/migrate-advisor-risk-followup.sql", import.meta.url),
  "utf8",
);
const propertyClient = readFileSync(
  new URL("./properties.ts", import.meta.url),
  "utf8",
);

const signature =
  "public.find_or_create_property(\n  text, double precision, double precision, text, integer,\n  text, text, text, text, text, text, text\n)";

function propertyFunction(sql: string) {
  const match = sql.match(
    /create or replace function public\.find_or_create_property\([\s\S]*?\n\$\$;/,
  );
  expect(match).not.toBeNull();
  return match![0];
}

describe("property and advisor security contract", () => {
  it.each([unitMigration, schema])(
    "uses country+street+unit identity without proximity merging",
    (sql) => {
      const fn = propertyFunction(sql);
      expect(fn).toContain(
        "on conflict (country_code, normalized_address, unit_key) do update",
      );
      expect(fn).not.toMatch(/\bacos\b|\bradians\b|<= 500|between p_lat/i);
      expect(fn).toContain("set search_path = pg_catalog, public");
      expect(fn).toContain("char_length(v_norm) < 3");
      expect(fn).toContain("invalid coordinates");
      expect(fn).toContain("p_unit_key");
      expect(fn).toContain("invalid unit_key");
    },
  );

  it.each([unitMigration, schema])(
    "allows only service_role to execute the property function",
    (sql) => {
      expect(sql).toContain(
        `revoke all on function ${signature} from public, anon, authenticated;`,
      );
      expect(sql).toContain(
        `grant execute on function ${signature} to service_role;`,
      );
      expect(sql).not.toContain(
        `grant execute on function ${signature}\n  to anon`,
      );
    },
  );

  it("declares explicit deny-all client RLS for share unlock limits", () => {
    expect(advisorMigration).toContain(
      'create policy "deny client access to share unlock limits"',
    );
    expect(advisorMigration).toContain("to anon, authenticated\n  using (false)");
    expect(advisorMigration).toContain(
      "revoke all on public.share_unlock_limits from public, anon, authenticated",
    );
    expect(schema).toContain(
      'create policy "deny client access to share unlock limits"',
    );
  });

  it("has no publishable-client fallback in the server adapter", () => {
    expect(propertyClient).toContain("createAdminClient()");
    expect(propertyClient).not.toContain("createClient");
    expect(propertyClient).not.toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  });
});
