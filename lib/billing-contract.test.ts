import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL("../supabase/migrate-billing-audit-authorization.sql", import.meta.url),
  "utf8",
);
const orderingFix = readFileSync(
  new URL("../supabase/migrate-stripe-ordering-forward-fix.sql", import.meta.url),
  "utf8",
);

describe("Stripe persistence SQL contract", () => {
  it("deduplicates, serializes, and rejects older events atomically", () => {
    expect(sql).toContain("event_id text primary key");
    expect(sql).toContain("on conflict (event_id) do nothing");
    expect(sql).toContain("return query select 'duplicate'::text");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain(
      "v_current.last_stripe_event_created > p_event_created",
    );
    expect(sql).toContain("update public.viewings");
  });

  it("keeps the ledger private and the RPC service-role only", () => {
    expect(sql).toContain(
      "revoke all on private.stripe_webhook_events from public, anon, authenticated",
    );
    expect(sql).toContain(
      "grant execute on function public.process_stripe_subscription_event",
    );
    expect(sql).toContain("to service_role");
  });

  it("uses a deterministic denial-wins rule for same-second events", () => {
    expect(orderingFix).toContain("last_stripe_event_rank");
    expect(orderingFix).toContain("p_event_type = 'customer.subscription.deleted'");
    expect(orderingFix).toContain("when not v_active then 2");
    expect(orderingFix).toContain("last_stripe_event_created = p_event_created");
    expect(orderingFix).toContain("last_stripe_event_rank > v_rank");
    expect(orderingFix).toContain("last_stripe_event_id, '') >= p_event_id");
  });
});
