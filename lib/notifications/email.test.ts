import { afterEach, describe, expect, it } from "vitest";
import {
  createResendEmailAdapter,
  setNotificationEmailAdapterForTests,
} from "./email";

describe("createResendEmailAdapter", () => {
  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
    setNotificationEmailAdapterForTests(null);
  });

  it("skips when API key is unset", async () => {
    const adapter = createResendEmailAdapter();
    const status = await adapter.send({
      to: "a@example.com",
      subject: "Hi",
      text: "Hello",
      html: "<p>Hello</p>",
    });
    expect(status).toBe("skipped");
  });

  it("skips when from address is unset", async () => {
    process.env.RESEND_API_KEY = "re_test";
    const adapter = createResendEmailAdapter();
    const status = await adapter.send({
      to: "a@example.com",
      subject: "Hi",
      text: "Hello",
      html: "<p>Hello</p>",
    });
    expect(status).toBe("skipped");
  });
});
