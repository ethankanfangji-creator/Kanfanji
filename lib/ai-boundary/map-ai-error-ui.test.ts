import { describe, expect, it } from "vitest";
import { mapAiErrorToUi, type AiErrorUiCopy } from "./map-ai-error-ui";

const copy: AiErrorUiCopy = {
  quotaGuest: "GUEST_QUOTA",
  quotaUser: "USER_QUOTA",
  authRequired: "AUTH",
  consentRequired: "CONSENT",
  unavailable: "UNAVAIL",
  failed: "FAILED",
  timeout: "TIMEOUT",
  validation: "VALIDATION",
};

describe("mapAiErrorToUi", () => {
  it("maps 429 / ai_quota_exceeded to guest quota + sign-in/upgrade", () => {
    expect(
      mapAiErrorToUi(
        { code: "ai_quota_exceeded", status: 429, error: "AI request could not be completed." },
        copy,
        { isAuthenticated: false },
      ),
    ).toEqual({
      kind: "quota",
      message: "GUEST_QUOTA",
      actions: ["sign_in", "upgrade"],
    });
  });

  it("maps quota exceeded for signed-in users to upgrade + retry", () => {
    expect(
      mapAiErrorToUi({ code: "ai_quota_exceeded", status: 429 }, copy, {
        isAuthenticated: true,
      }),
    ).toEqual({
      kind: "quota",
      message: "USER_QUOTA",
      actions: ["upgrade", "retry"],
    });
  });

  it("maps 401 / auth codes to sign-in", () => {
    expect(mapAiErrorToUi({ code: "ai_auth_required", status: 401 }, copy)).toEqual({
      kind: "auth",
      message: "AUTH",
      actions: ["sign_in"],
    });
    expect(mapAiErrorToUi({ code: "ai_identity_mismatch", status: 401 }, copy).kind).toBe(
      "auth",
    );
    expect(mapAiErrorToUi({ status: 401 }, copy).actions).toEqual(["sign_in"]);
  });

  it("maps 5xx / upstream to retryable failed or timeout", () => {
    expect(mapAiErrorToUi({ code: "ai_upstream_failed", status: 502 }, copy)).toEqual({
      kind: "upstream",
      message: "FAILED",
      actions: ["retry"],
    });
    expect(mapAiErrorToUi({ code: "ai_upstream_timeout", status: 504 }, copy)).toEqual({
      kind: "timeout",
      message: "TIMEOUT",
      actions: ["retry"],
    });
    expect(mapAiErrorToUi({ status: 503, code: "ai_quota_unavailable" }, copy)).toEqual({
      kind: "unavailable",
      message: "UNAVAIL",
      actions: ["retry"],
    });
  });

  it("does not surface the opaque English server error string", () => {
    const ui = mapAiErrorToUi(
      { error: "AI request could not be completed.", status: 502 },
      copy,
    );
    expect(ui.message).toBe("FAILED");
    expect(ui.message).not.toContain("could not be completed");
  });

  it("maps other 4xx to validation + retry", () => {
    expect(
      mapAiErrorToUi({ code: "audio_too_large", status: 413 }, copy),
    ).toEqual({
      kind: "validation",
      message: "VALIDATION",
      actions: ["retry"],
    });
  });

  it("maps consent required", () => {
    expect(
      mapAiErrorToUi({ code: "ai_consent_required", status: 403 }, copy),
    ).toEqual({
      kind: "consent",
      message: "CONSENT",
      actions: ["retry"],
    });
  });
});
