import { beforeEach, describe, expect, it, vi } from "vitest";

const { constructEvent, retrieve, persistStripeEvent } = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  retrieve: vi.fn(),
  persistStripeEvent: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    webhooks: { constructEvent },
    subscriptions: { retrieve },
  }),
}));
vi.mock("@/lib/billing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/billing")>();
  return { ...actual, persistStripeEvent };
});
vi.mock("@/utils/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { POST } from "./route";

const request = () =>
  new Request("http://test/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": "signed" },
    body: "{}",
  });

describe("Stripe webhook", () => {
  beforeEach(() => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    constructEvent.mockReset();
    retrieve.mockReset();
    persistStripeEvent.mockReset();
  });

  it("returns a stable error for an invalid signature", async () => {
    constructEvent.mockImplementation(() => {
      throw new Error("secret provider detail");
    });
    const response = await POST(request());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "INVALID_WEBHOOK_SIGNATURE" });
  });

  it.each(["duplicate", "out_of_order"])("acknowledges %s events", async (outcome) => {
    const event = { id: "evt_1", type: "unhandled", created: 10, data: { object: {} } };
    constructEvent.mockReturnValue(event);
    persistStripeEvent.mockResolvedValue(outcome);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, outcome });
  });

  it("returns 500 so Stripe retries persistence failures", async () => {
    constructEvent.mockReturnValue({
      id: "evt_2",
      type: "unhandled",
      created: 11,
      data: { object: {} },
    });
    persistStripeEvent.mockRejectedValue(new Error("database detail"));
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "WEBHOOK_PROCESSING_FAILED" });
  });
});
