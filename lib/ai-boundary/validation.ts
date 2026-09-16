import {
  AI_CONSENT_VERSION,
  AI_LIMITS,
  AI_LOCALES,
  AI_MARKETS,
  AUDIO_MIME_TYPES,
  IMAGE_MIME_TYPES,
  type AiLocale,
  type AiMarket,
} from "./config";

export class AiInputError extends Error {
  constructor(
    readonly code: string,
    readonly status = 400,
  ) {
    super(code);
  }
}

function optionalString(value: FormDataEntryValue | null, max: number, code: string): string {
  if (value == null || value === "") return "";
  if (typeof value !== "string" || value.length > max) throw new AiInputError(code);
  return value.trim();
}

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  code: string,
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) throw new AiInputError(code);
  return value as T;
}

function parseJson(value: FormDataEntryValue | null, max: number, code: string): unknown {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.length > max) throw new AiInputError(code);
  try {
    return JSON.parse(value);
  } catch {
    throw new AiInputError(code);
  }
}

export type AiConsentAssertion = {
  consentVersion: typeof AI_CONSENT_VERSION;
  consentSessionId: string;
  identityKind: "guest" | "user";
};

function validateConsent(
  get: (key: string) => unknown,
): AiConsentAssertion {
  if (get("consentVersion") !== AI_CONSENT_VERSION) {
    throw new AiInputError("ai_consent_required", 403);
  }
  const consentSessionId = get("consentSessionId");
  if (
    typeof consentSessionId !== "string" ||
    !consentSessionId.trim() ||
    consentSessionId.length > AI_LIMITS.sessionId
  ) {
    throw new AiInputError("ai_consent_required", 403);
  }
  const identityKind = get("identityKind");
  if (identityKind !== "guest" && identityKind !== "user") {
    throw new AiInputError("ai_identity_invalid", 401);
  }
  return {
    consentVersion: AI_CONSENT_VERSION,
    consentSessionId: consentSessionId.trim(),
    identityKind,
  };
}

type QuestionInput = { id: number; text: string };
type MarkerInput = { t?: number; tag?: string; note?: string };

export type RecordingInput = AiConsentAssertion & {
  audio: File;
  durationSec: number;
  questions: QuestionInput[];
  address: string;
  market: AiMarket;
  locale: AiLocale;
  openData: Record<string, unknown> | null;
  propertyContext: { tags?: string[]; neighborhood?: string; city?: string } | null;
  markers: MarkerInput[];
  mediaId: string | null;
  noteId: number | null;
};

export function assertContentLength(request: Request): void {
  const raw = request.headers.get("content-length");
  if (!raw) return;
  const length = Number(raw);
  if (!Number.isFinite(length) || length < 0 || length > AI_LIMITS.contentLengthBytes) {
    throw new AiInputError("request_too_large", 413);
  }
}

export function validateRecordingForm(form: FormData): RecordingInput {
  const consent = validateConsent((key) => form.get(key));
  const audio = form.get("audio");
  if (!(audio instanceof File)) throw new AiInputError("audio_required");
  if (!AUDIO_MIME_TYPES.has(audio.type) || audio.size <= 0) {
    throw new AiInputError("audio_mime_invalid", 415);
  }
  if (audio.size > AI_LIMITS.audioBytes) throw new AiInputError("audio_too_large", 413);

  const durationSec = Number(form.get("durationSec"));
  if (!Number.isFinite(durationSec) || durationSec <= 0 || durationSec > AI_LIMITS.durationSec) {
    throw new AiInputError("audio_duration_invalid");
  }

  const questionsRaw = parseJson(
    form.get("questions"),
    AI_LIMITS.contextJsonChars,
    "questions_invalid",
  );
  if (!Array.isArray(questionsRaw) || questionsRaw.length > AI_LIMITS.questions) {
    throw new AiInputError("questions_invalid");
  }
  const questions = questionsRaw.map((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      !Number.isSafeInteger((item as QuestionInput).id) ||
      typeof (item as QuestionInput).text !== "string" ||
      !(item as QuestionInput).text.trim() ||
      (item as QuestionInput).text.length > AI_LIMITS.questionText
    ) {
      throw new AiInputError("questions_invalid");
    }
    return { id: (item as QuestionInput).id, text: (item as QuestionInput).text.trim() };
  });

  const markersRaw = parseJson(form.get("markers"), AI_LIMITS.contextJsonChars, "markers_invalid");
  const markers = markersRaw == null ? [] : markersRaw;
  if (!Array.isArray(markers) || markers.length > AI_LIMITS.markers) {
    throw new AiInputError("markers_invalid");
  }
  for (const marker of markers) {
    if (
      !marker ||
      typeof marker !== "object" ||
      (marker.t != null && (!Number.isFinite(marker.t) || marker.t < 0 || marker.t > durationSec)) ||
      (marker.tag != null && (typeof marker.tag !== "string" || marker.tag.length > 40)) ||
      (marker.note != null &&
        (typeof marker.note !== "string" || marker.note.length > AI_LIMITS.markerNote))
    ) {
      throw new AiInputError("markers_invalid");
    }
  }

  const openData = parseJson(
    form.get("openData"),
    AI_LIMITS.contextJsonChars,
    "context_invalid",
  );
  const propertyContext = parseJson(
    form.get("propertyContext"),
    AI_LIMITS.contextJsonChars,
    "context_invalid",
  );
  if (
    (openData != null && (typeof openData !== "object" || Array.isArray(openData))) ||
    (propertyContext != null &&
      (typeof propertyContext !== "object" || Array.isArray(propertyContext)))
  ) {
    throw new AiInputError("context_invalid");
  }
  if (openData) {
    const allowed = new Set([
      "city",
      "zoningCode",
      "zoningLabel",
      "pid",
      "planNumber",
      "lotNumber",
      "legalDescription",
      "source",
    ]);
    for (const [key, value] of Object.entries(openData)) {
      if (
        !allowed.has(key) ||
        (value != null &&
          (typeof value !== "string" || value.length > AI_LIMITS.genericString))
      ) {
        throw new AiInputError("context_invalid");
      }
    }
  }
  if (propertyContext) {
    const context = propertyContext as Record<string, unknown>;
    for (const key of Object.keys(context)) {
      if (!["tags", "neighborhood", "city"].includes(key)) {
        throw new AiInputError("context_invalid");
      }
    }
    if (
      (context.city != null &&
        (typeof context.city !== "string" || context.city.length > AI_LIMITS.genericString)) ||
      (context.neighborhood != null &&
        (typeof context.neighborhood !== "string" ||
          context.neighborhood.length > AI_LIMITS.genericString)) ||
      (context.tags != null &&
        (!Array.isArray(context.tags) ||
          context.tags.length > 40 ||
          context.tags.some((tag) => typeof tag !== "string" || tag.length > 80)))
    ) {
      throw new AiInputError("context_invalid");
    }
  }

  const noteIdRaw = optionalString(form.get("noteId"), 24, "note_id_invalid");
  const noteId = noteIdRaw ? Number(noteIdRaw) : null;
  if (noteId != null && !Number.isSafeInteger(noteId)) throw new AiInputError("note_id_invalid");

  return {
    ...consent,
    audio,
    durationSec,
    questions,
    address: optionalString(form.get("address"), AI_LIMITS.genericString, "address_invalid"),
    market: enumValue(form.get("market"), AI_MARKETS, "market_invalid"),
    locale: enumValue(form.get("locale"), AI_LOCALES, "locale_invalid"),
    openData: openData as Record<string, unknown> | null,
    propertyContext: propertyContext as RecordingInput["propertyContext"],
    markers: markers as MarkerInput[],
    mediaId: optionalString(form.get("mediaId"), AI_LIMITS.sessionId, "media_id_invalid") || null,
    noteId,
  };
}

export type VisionInput = AiConsentAssertion & {
  base64: string;
  mime: "image/jpeg" | "image/png" | "image/webp";
  tag: string;
  locale: AiLocale;
  market: AiMarket;
  mediaId: string;
};

export function validateVisionBody(body: unknown): VisionInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new AiInputError("json_invalid");
  }
  const input = body as Record<string, unknown>;
  const consent = validateConsent((key) => input[key]);
  const tag =
    typeof input.tag === "string" && input.tag.trim() ? input.tag.trim() : "on-site";
  if (tag.length > 80) throw new AiInputError("tag_invalid");
  if (
    typeof input.base64 !== "string" ||
    !input.base64 ||
    input.base64.length > AI_LIMITS.imageBase64Chars
  ) {
    throw new AiInputError("image_too_large", 413);
  }
  const match = input.base64.match(
    /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/,
  );
  if (!match || !IMAGE_MIME_TYPES.has(match[1])) throw new AiInputError("image_mime_invalid", 415);
  const base64 = match[2];
  const estimatedBytes = Math.floor((base64.length * 3) / 4);
  if (estimatedBytes <= 0 || estimatedBytes > AI_LIMITS.imageBytes) {
    throw new AiInputError("image_too_large", 413);
  }
  return {
    ...consent,
    base64,
    mime: match[1] as VisionInput["mime"],
    tag,
    locale: enumValue(input.locale, AI_LOCALES, "locale_invalid"),
    market: enumValue(input.market, AI_MARKETS, "market_invalid"),
    mediaId:
      typeof input.mediaId === "string" &&
      input.mediaId.trim().length > 0 &&
      input.mediaId.length <= AI_LIMITS.sessionId
        ? input.mediaId.trim()
        : (() => {
            throw new AiInputError("media_id_invalid");
          })(),
  };
}
