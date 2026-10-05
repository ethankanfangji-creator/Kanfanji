import { beforeEach, describe, expect, it, vi } from "vitest";

const insertMock = vi.fn();
const updateEqMock = vi.fn();
const rpcMock = vi.fn();
const getUserByIdMock = vi.fn();
const prefsSelectMock = vi.fn();

vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "notification_preferences") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: prefsSelectMock,
            }),
          }),
        };
      }
      if (table === "notifications") {
        return {
          insert: (row: unknown) => {
            insertMock(row);
            return {
              select: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "n1",
                    type: (row as { type: string }).type,
                    title: (row as { title: string }).title,
                    body: (row as { body: string }).body,
                    href: (row as { href: string | null }).href,
                    payload: (row as { payload: Record<string, unknown> }).payload,
                    read_at: null,
                    email_status: (row as { email_status: string }).email_status,
                    created_at: "2026-10-04T00:00:00.000Z",
                  },
                  error: null,
                }),
              }),
            };
          },
          update: () => ({
            eq: updateEqMock,
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    rpc: rpcMock,
    auth: {
      admin: {
        getUserById: getUserByIdMock,
      },
    },
  }),
}));

const sendMock = vi.fn();

vi.mock("./email", () => ({
  getNotificationEmailAdapter: () => ({
    send: sendMock,
  }),
}));

describe("createNotification", () => {
  beforeEach(() => {
    vi.resetModules();
    insertMock.mockReset();
    updateEqMock.mockReset();
    updateEqMock.mockResolvedValue({ data: null, error: null });
    rpcMock.mockReset();
    getUserByIdMock.mockReset();
    prefsSelectMock.mockReset();
    prefsSelectMock.mockResolvedValue({ data: null, error: null });
    sendMock.mockReset();
    sendMock.mockResolvedValue("sent");
  });

  it("skips when actor is the recipient", async () => {
    const { createNotification } = await import("./create");
    const result = await createNotification({
      type: "invite_accepted",
      userId: "u1",
      actorUserId: "u1",
      title: "t",
      channels: { inApp: true, email: true },
      email: "a@example.com",
    });
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("actor_is_recipient");
    expect(insertMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("skips email when RESEND adapter returns skipped and still writes in-app", async () => {
    sendMock.mockResolvedValue("skipped");
    const { createNotification } = await import("./create");
    const result = await createNotification({
      type: "share_comment",
      userId: "u1",
      email: "owner@example.com",
      title: "New comment",
      body: "hello",
      href: "/shares",
      channels: { inApp: true, email: true },
      payload: {
        emailSubject: "subj",
        emailText: "text",
        emailHtml: "<p>text</p>",
      },
    });
    expect(result.skipped).toBe(false);
    expect(result.notification?.id).toBe("n1");
    expect(result.emailStatus).toBe("skipped");
    expect(insertMock).toHaveBeenCalled();
    expect(sendMock).toHaveBeenCalled();
  });

  it("sends email-only invite without in-app row", async () => {
    const { createNotification } = await import("./create");
    const result = await createNotification({
      type: "invite_created",
      email: "invitee@example.com",
      title: "Invite",
      body: "Join",
      channels: { inApp: false, email: true },
      payload: {
        emailSubject: "Invite",
        emailText: "Join",
        emailHtml: "<p>Join</p>",
      },
    });
    expect(result.notification).toBeUndefined();
    expect(result.emailStatus).toBe("sent");
    expect(insertMock).not.toHaveBeenCalled();
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: "invitee@example.com" }),
    );
  });

  it("respects email_enabled preference default true when row missing", async () => {
    prefsSelectMock.mockResolvedValue({ data: null, error: null });
    const { createNotification } = await import("./create");
    await createNotification({
      type: "share_comment",
      userId: "u1",
      email: "owner@example.com",
      title: "New comment",
      channels: { inApp: true, email: true },
    });
    expect(sendMock).toHaveBeenCalled();
  });

  it("skips email when preference disables it", async () => {
    prefsSelectMock.mockResolvedValue({
      data: { email_enabled: false },
      error: null,
    });
    const { createNotification } = await import("./create");
    const result = await createNotification({
      type: "share_comment",
      userId: "u1",
      email: "owner@example.com",
      title: "New comment",
      channels: { inApp: true, email: true },
    });
    expect(result.emailStatus).toBe("skipped");
    expect(sendMock).not.toHaveBeenCalled();
    expect(insertMock).toHaveBeenCalled();
  });
});

describe("buildNotificationCopy href mapping", () => {
  it("builds absolute email links", async () => {
    const { buildNotificationCopy } = await import("./copy");
    const copy = buildNotificationCopy({
      type: "invite_created",
      locale: "en",
      siteUrl: "https://example.com",
      href: "/invite/abc",
      vars: { address: "123 Main" },
    });
    expect(copy.emailText).toContain("https://example.com/invite/abc");
    expect(copy.title).toContain("invited");
  });
});
