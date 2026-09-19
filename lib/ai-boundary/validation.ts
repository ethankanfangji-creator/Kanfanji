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

export type ViewingHighlightsInput = AiConsentAssertion & {
  address: string;
  locale: AiLocale;
  market: AiMarket;
  openData: Record<string, unknown> | null;
  propertyContext: { tags?: string[]; neighborhood?: string; city?: string } | null;
};

export type PropertyBasicsInput = AiConsentAssertion & {
  address: string;
  locale: AiLocale;
  market: AiMarket;
  openData: Record<string, unknown> | null;
  propertyContext: {
    tags?: string[];
    neighborhood?: string;
    city?: string;
    province?: string;
    country?: string;
    postalCode?: string;
    lat?: number;
    lng?: number;
    source?: string;
  } | null;
  /** Optional free-text; if off-topic, model must refuse and ask for address. */
  userQuestion?: string;
};

export type IntegrateInputBody = AiConsentAssertion & {
  viewingSessionId: string;
  address: string;
  locale: AiLocale;
  market: AiMarket;
  boundQuestionId: number | null;
  boundQuestionText: string | null;
  text: string;
  transcript: string;
  questions: Array<{ id: number; text: string; answer?: string; category?: string }>;
  imageBase64: string | null;
  imageMime: "image/jpeg" | "image/png" | "image/webp" | null;
};

function validateOpenDataObject(openData: unknown): Record<string, unknown> | null {
  if (openData == null) return null;
  if (typeof openData !== "object" || Array.isArray(openData)) {
    throw new AiInputError("context_invalid");
  }
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
  return openData as Record<string, unknown>;
}

function validatePropertyContextObject(
  propertyContext: unknown,
): ViewingHighlightsInput["propertyContext"] {
  if (propertyContext == null) return null;
  if (typeof propertyContext !== "object" || Array.isArray(propertyContext)) {
    throw new AiInputError("context_invalid");
  }
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
  return context as ViewingHighlightsInput["propertyContext"];
}

export function validateViewingHighlightsBody(body: unknown): ViewingHighlightsInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new AiInputError("json_invalid");
  }
  const input = body as Record<string, unknown>;
  const consent = validateConsent((key) => input[key]);
  if (typeof input.address !== "string" || !input.address.trim()) {
    throw new AiInputError("address_invalid");
  }
  if (input.address.length > AI_LIMITS.genericString) {
    throw new AiInputError("address_invalid");
  }
  return {
    ...consent,
    address: input.address.trim(),
    locale: enumValue(input.locale, AI_LOCALES, "locale_invalid"),
    market: enumValue(input.market, AI_MARKETS, "market_invalid"),
    openData: validateOpenDataObject(input.openData),
    propertyContext: validatePropertyContextObject(input.propertyContext),
  };
}

function validatePropertyBasicsContext(
  propertyContext: unknown,
): PropertyBasicsInput["propertyContext"] {
  if (propertyContext == null) return null;
  if (typeof propertyContext !== "object" || Array.isArray(propertyContext)) {
    throw new AiInputError("context_invalid");
  }
  const context = propertyContext as Record<string, unknown>;
  const allowed = new Set([
    "tags",
    "neighborhood",
    "city",
    "province",
    "country",
    "postalCode",
    "lat",
    "lng",
    "source",
  ]);
  for (const key of Object.keys(context)) {
    if (!allowed.has(key)) throw new AiInputError("context_invalid");
  }
  if (
    (context.city != null &&
      (typeof context.city !== "string" || context.city.length > AI_LIMITS.genericString)) ||
    (context.neighborhood != null &&
      (typeof context.neighborhood !== "string" ||
        context.neighborhood.length > AI_LIMITS.genericString)) ||
    (context.province != null &&
      (typeof context.province !== "string" ||
        context.province.length > AI_LIMITS.genericString)) ||
    (context.country != null &&
      (typeof context.country !== "string" ||
        context.country.length > AI_LIMITS.genericString)) ||
    (context.postalCode != null &&
      (typeof context.postalCode !== "string" ||
        context.postalCode.length > AI_LIMITS.genericString)) ||
    (context.source != null &&
      (typeof context.source !== "string" ||
        context.source.length > AI_LIMITS.genericString)) ||
    (context.tags != null &&
      (!Array.isArray(context.tags) ||
        context.tags.length > 40 ||
        context.tags.some((tag) => typeof tag !== "string" || tag.length > 80))) ||
    (context.lat != null &&
      (typeof context.lat !== "number" || !Number.isFinite(context.lat) || context.lat < -90 || context.lat > 90)) ||
    (context.lng != null &&
      (typeof context.lng !== "number" ||
        !Number.isFinite(context.lng) ||
        context.lng < -180 ||
        context.lng > 180))
  ) {
    throw new AiInputError("context_invalid");
  }
  return context as PropertyBasicsInput["propertyContext"];
}

export function validatePropertyBasicsBody(body: unknown): PropertyBasicsInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new AiInputError("json_invalid");
  }
  const input = body as Record<string, unknown>;
  const consent = validateConsent((key) => input[key]);
  if (typeof input.address !== "string" || !input.address.trim()) {
    throw new AiInputError("address_invalid");
  }
  if (input.address.length > AI_LIMITS.genericString) {
    throw new AiInputError("address_invalid");
  }
  const userQuestion =
    input.userQuestion == null || input.userQuestion === ""
      ? undefined
      : typeof input.userQuestion === "string" && input.userQuestion.length <= 500
        ? input.userQuestion.trim()
        : (() => {
            throw new AiInputError("question_invalid");
          })();
  return {
    ...consent,
    address: input.address.trim(),
    locale: enumValue(input.locale, AI_LOCALES, "locale_invalid"),
    market: enumValue(input.market, AI_MARKETS, "market_invalid"),
    openData: validateOpenDataObject(input.openData),
    propertyContext: validatePropertyBasicsContext(input.propertyContext),
    userQuestion,
  };
}

export function validateIntegrateInputBody(body: unknown): IntegrateInputBody {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new AiInputError("json_invalid");
  }
  const input = body as Record<string, unknown>;
  const consent = validateConsent((key) => input[key]);
  if (typeof input.viewingSessionId !== "string" || !input.viewingSessionId.trim()) {
    throw new AiInputError("session_invalid");
  }
  if (input.viewingSessionId.length > AI_LIMITS.sessionId) {
    throw new AiInputError("session_invalid");
  }
  if (typeof input.address !== "string" || !input.address.trim()) {
    throw new AiInputError("address_invalid");
  }
  if (input.address.length > AI_LIMITS.genericString) {
    throw new AiInputError("address_invalid");
  }

  const text =
    input.text == null || input.text === ""
      ? ""
      : typeof input.text === "string" && input.text.length <= 4000
        ? input.text.trim()
        : (() => {
            throw new AiInputError("text_invalid");
          })();
  const transcript =
    input.transcript == null || input.transcript === ""
      ? ""
      : typeof input.transcript === "string" && input.transcript.length <= 8000
        ? input.transcript.trim()
        : (() => {
            throw new AiInputError("transcript_invalid");
          })();

  let imageBase64: string | null = null;
  let imageMime: IntegrateInputBody["imageMime"] = null;
  if (input.imageBase64 != null && input.imageBase64 !== "") {
    if (typeof input.imageBase64 !== "string" || input.imageBase64.length > AI_LIMITS.imageBase64Chars) {
      throw new AiInputError("image_too_large", 413);
    }
    const match = input.imageBase64.match(
      /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/,
    );
    if (!match || !IMAGE_MIME_TYPES.has(match[1])) throw new AiInputError("image_mime_invalid", 415);
    const estimatedBytes = Math.floor((match[2].length * 3) / 4);
    if (estimatedBytes <= 0 || estimatedBytes > AI_LIMITS.imageBytes) {
      throw new AiInputError("image_too_large", 413);
    }
    imageBase64 = input.imageBase64;
    imageMime = match[1] as IntegrateInputBody["imageMime"];
  }

  if (!text && !transcript && !imageBase64) {
    throw new AiInputError("input_required");
  }

  const questionsRaw = input.questions;
  if (!Array.isArray(questionsRaw) || questionsRaw.length > AI_LIMITS.questions) {
    throw new AiInputError("questions_invalid");
  }
  const questions = questionsRaw.map((item) => {
    if (!item || typeof item !== "object") throw new AiInputError("questions_invalid");
    const row = item as Record<string, unknown>;
    if (!Number.isSafeInteger(row.id) || typeof row.text !== "string" || !row.text.trim()) {
      throw new AiInputError("questions_invalid");
    }
    return {
      id: row.id as number,
      text: row.text.trim().slice(0, AI_LIMITS.questionText),
      answer: typeof row.answer === "string" ? row.answer.trim().slice(0, 800) : undefined,
      category: typeof row.category === "string" ? row.category.slice(0, 40) : undefined,
    };
  });

  const boundQuestionId =
    input.boundQuestionId == null
      ? null
      : Number.isSafeInteger(input.boundQuestionId)
        ? (input.boundQuestionId as number)
        : (() => {
            throw new AiInputError("bound_question_invalid");
          })();
  const boundQuestionText =
    input.boundQuestionText == null || input.boundQuestionText === ""
      ? null
      : typeof input.boundQuestionText === "string"
        ? input.boundQuestionText.trim().slice(0, AI_LIMITS.questionText)
        : null;

  return {
    ...consent,
    viewingSessionId: input.viewingSessionId.trim(),
    address: input.address.trim(),
    locale: enumValue(input.locale, AI_LOCALES, "locale_invalid"),
    market: enumValue(input.market, AI_MARKETS, "market_invalid"),
    boundQuestionId,
    boundQuestionText,
    text,
    transcript,
    questions,
    imageBase64,
    imageMime,
  };
}
