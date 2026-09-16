import type { ProcessRecordingLegacyPayload } from "./types";

/** Happy path — full structured summary. */
export const fixtureValidStructured: ProcessRecordingLegacyPayload = {
  transcript: "Agent said the roof was replaced in 2018. Living room faces south.",
  answers: [{ id: 1, status: "answered", answer: "2018 roof" }],
  facts: [
    {
      id: "f1",
      text: "Roof replaced in 2018",
      confidence: "high",
      sources: [{ kind: "transcript", timestampSec: 12, quote: "roof was replaced in 2018" }],
    },
  ],
  pros: [
    {
      id: "p1",
      text: "South-facing living room",
      confidence: "medium",
      sources: [{ kind: "transcript", timestampSec: 20, quote: "Living room faces south" }],
    },
  ],
  risks: [
    {
      id: "r1",
      text: "Possible moisture near bathroom fan",
      confidence: "needs_verification",
      sources: [{ kind: "marker", timestampSec: 45, quote: null }],
    },
  ],
  followUps: [
    {
      id: "q1",
      text: "Ask for roof invoice / permit",
      confidence: "high",
      sources: [{ kind: "transcript", timestampSec: 12 }],
    },
  ],
  actionItems: [
    {
      id: "a1",
      text: "Book a home inspection focused on roof and bathroom",
      confidence: "medium",
      sources: [],
    },
  ],
};

/** Legacy pros/risks as plain strings (pre-structured API). */
export const fixtureLegacyStrings: ProcessRecordingLegacyPayload = {
  transcript: "價格偏高但採光不錯",
  pros: ["採光不錯"],
  risks: ["價格偏高"],
  new_questions: [{ text: "管理費含什麼？", status: "pending", answer: "待確認" }],
};

/** Empty-ish but salvageable (transcript only). */
export const fixtureTranscriptOnly: ProcessRecordingLegacyPayload = {
  transcript: "Hello from the open house.",
  pros: [],
  risks: [],
};

/** Completely unusable. */
export const fixtureEmpty: ProcessRecordingLegacyPayload = {
  transcript: "",
  pros: [],
  risks: [],
};

/** Malformed claim objects mixed with valid ones. */
export const fixturePartialBadClaims = {
  transcript: "Noise from the highway.",
  facts: [
    { id: "ok", text: "Highway noise mentioned", confidence: "high", sources: [] },
    { id: "bad", confidence: "nope", sources: "x" },
    "Plain string fact",
  ],
  pros: "not-an-array",
  risks: [{ text: "Noise risk", confidence: "low", sources: [] }],
} as unknown as ProcessRecordingLegacyPayload;
