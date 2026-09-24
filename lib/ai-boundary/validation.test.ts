import { describe, expect, it } from "vitest";
import {
  AI_CONSENT_VERSION,
  AI_LIMITS,
  AiInputError,
  validateIntegrateInputBody,
  validateRecordingForm,
  validateVisionBody,
} from "./index";

function validRecordingForm() {
  const form = new FormData();
  form.set("audio", new File(["audio"], "note.webm", { type: "audio/webm" }));
  form.set("durationSec", "2");
  form.set("questions", JSON.stringify([{ id: 1, text: "Any leaks?" }]));
  form.set("markers", "[]");
  form.set("openData", "null");
  form.set("propertyContext", JSON.stringify({ tags: ["bathroom"] }));
  form.set("market", "CA");
  form.set("locale", "en");
  form.set("consentVersion", AI_CONSENT_VERSION);
  form.set("consentSessionId", "session-1");
  form.set("identityKind", "guest");
  return form;
}

describe("AI inbound validation", () => {
  it("requires current, per-session consent", () => {
    const form = validRecordingForm();
    form.delete("consentVersion");
    expect(() => validateRecordingForm(form)).toThrowError(
      expect.objectContaining({ code: "ai_consent_required", status: 403 }),
    );
  });

  it("rejects oversized audio before provider access", () => {
    const form = validRecordingForm();
    const oversized = new File([new Uint8Array(AI_LIMITS.audioBytes + 1)], "big.webm", {
      type: "audio/webm",
    });
    form.set("audio", oversized);
    expect(() => validateRecordingForm(form)).toThrowError(
      expect.objectContaining({ code: "audio_too_large", status: 413 }),
    );
  });

  it("rejects malformed MIME, question, marker and context values", () => {
    const mime = validRecordingForm();
    mime.set("audio", new File(["x"], "x.exe", { type: "application/octet-stream" }));
    expect(() => validateRecordingForm(mime)).toThrowError(
      expect.objectContaining({ code: "audio_mime_invalid" }),
    );

    const questions = validRecordingForm();
    questions.set("questions", JSON.stringify([{ id: 1, text: "x".repeat(301) }]));
    expect(() => validateRecordingForm(questions)).toThrowError(
      expect.objectContaining({ code: "questions_invalid" }),
    );

    const markers = validRecordingForm();
    markers.set("markers", JSON.stringify([{ t: 99, note: "late" }]));
    expect(() => validateRecordingForm(markers)).toThrowError(
      expect.objectContaining({ code: "markers_invalid" }),
    );

    const context = validRecordingForm();
    context.set("propertyContext", JSON.stringify({ secret: "not allowlisted" }));
    expect(() => validateRecordingForm(context)).toThrowError(
      expect.objectContaining({ code: "context_invalid" }),
    );
  });

  it("rejects malformed, unsupported and oversized image base64", () => {
    const base = {
      tag: "window",
      locale: "en",
      market: "CA",
      mediaId: "media-1",
      consentVersion: AI_CONSENT_VERSION,
      consentSessionId: "session-1",
      identityKind: "guest",
    };
    expect(() => validateVisionBody({ ...base, base64: "not-base64" })).toThrowError(
      expect.objectContaining({ code: "image_mime_invalid" }),
    );
    expect(() =>
      validateVisionBody({ ...base, base64: "data:image/gif;base64,AAAA" }),
    ).toThrowError(expect.objectContaining({ code: "image_mime_invalid" }));
    expect(() =>
      validateVisionBody({
        ...base,
        base64: `data:image/jpeg;base64,${"A".repeat(AI_LIMITS.imageBase64Chars + 1)}`,
      }),
    ).toThrowError(expect.objectContaining({ code: "image_too_large" }));
  });

  it("uses stable typed input errors", () => {
    const error = new AiInputError("bad", 422);
    expect(error).toMatchObject({ code: "bad", status: 422 });
  });

  it("validates integrate-input body and requires at least one payload", () => {
    const base = {
      viewingSessionId: "view-1",
      address: "123 Main St",
      locale: "zh-Hant",
      market: "CA",
      boundQuestionId: 1,
      boundQuestionText: "Check leaks",
      text: "Ceiling stain",
      transcript: "",
      questions: [{ id: 1, text: "Check leaks", category: "condition" }],
      imageBase64: null,
      consentVersion: AI_CONSENT_VERSION,
      consentSessionId: "session-1",
      identityKind: "guest",
    };
    expect(validateIntegrateInputBody(base).text).toBe("Ceiling stain");
    expect(() =>
      validateIntegrateInputBody({ ...base, text: "", transcript: "", imageBase64: null }),
    ).toThrowError(expect.objectContaining({ code: "input_required" }));
  });
});
