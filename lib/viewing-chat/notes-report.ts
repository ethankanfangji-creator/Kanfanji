import "server-only";

import OpenAI from "openai";
import { viewingRecorderReportRules } from "@/lib/viewing-chat/collection";
import {
  ChatReportLlmSchema,
  parseLlmJson,
} from "@/lib/viewing-chat/collection/llm-schemas";
import {
  briefingDisplaySources,
  briefingDisplaySummary,
  briefingHasContent,
  notesFingerprint,
  type ViewingBriefing,
} from "@/lib/viewing-chat/briefing";
import type { BriefingFoundFact } from "@/lib/viewing-chat/briefing-facts";
import {
  collectReportMediaRefs,
  formatBriefingIntroForReport,
  formatPropertyFactsForReport,
  notesTranscript,
} from "@/lib/viewing-chat/notes-report-text";
import {
  assembleReportSummary,
  normalizeReportMeta,
  normalizeReportScores,
} from "@/lib/viewing-chat/report-sections";
import {
  DEFAULT_CHAT_REPORT_TITLE,
  resolveChatReportTitle,
} from "@/lib/viewing-chat/report-title";
import type {
  ChatMediaRef,
  ChatMessage,
  ChatReportScores,
  ChatReportSnapshot,
} from "@/lib/viewing-chat/types";

export {
  collectReportMediaRefs,
  formatBriefingIntroForReport,
  formatPropertyFactsForReport,
  notesTranscript,
  reclassifyNegotiationRisks,
} from "@/lib/viewing-chat/notes-report-text";

function normalizeStringList(items: string[] | undefined, max: number): string[] {
  return (items ?? []).map((item) => item.trim()).filter(Boolean).slice(0, max);
}

function buildSnapshot(partial: Omit<ChatReportSnapshot, "generatedAt" | "feedback" | "feedbackAt"> & {
  fingerprint: string;
  mediaRefs: ChatMediaRef[];
}): ChatReportSnapshot {
  const nextSteps = partial.nextSteps ?? [];
  const biggestQuestion = partial.scores?.biggestQuestion?.trim();
  return {
    title: partial.title,
    meta: partial.meta,
    overview: partial.overview,
    interior: partial.interior,
    outdoorLand: partial.outdoorLand,
    transitLifestyle: partial.transitLifestyle,
    pricing: partial.pricing,
    pros: partial.pros,
    risks: partial.risks,
    scores: partial.scores,
    verdict: partial.verdict,
    nextSteps,
    followUps: partial.followUps?.length
      ? partial.followUps
      : nextSteps.length
        ? nextSteps
        : biggestQuestion
          ? [biggestQuestion]
          : [],
    checklist: partial.checklist ?? [],
    summary: partial.summary,
    generatedAt: new Date().toISOString(),
    notesFingerprint: partial.fingerprint,
    mediaRefs: partial.mediaRefs,
    feedback: null,
    feedbackAt: null,
  };
}

function briefingBlockFromInput(briefing?: ViewingBriefing | null): string {
  if (!briefing) return formatBriefingIntroForReport(null);
  return formatBriefingIntroForReport({
    summary: briefingDisplaySummary(briefing),
    sources: briefingDisplaySources(briefing),
    points: briefing.points,
  });
}

/** Notes + briefing + facts → ChatGPT-template sectioned report (with scores). */
export async function buildNotesOnlyReport(input: {
  apiKey: string;
  address: string;
  locale: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
  preferenceBlock?: string;
  propertyFacts?: BriefingFoundFact[];
  briefing?: ViewingBriefing | null;
}): Promise<{
  report: ChatReportSnapshot;
  extractionStatus: "ok" | "extraction_failed";
}> {
  const fingerprint = notesFingerprint(input.messages);
  const notes = notesTranscript(input.messages);
  const mediaRefs = collectReportMediaRefs(input.messages);
  const factsBlock = formatPropertyFactsForReport(input.propertyFacts ?? []);
  const briefingBlock = briefingBlockFromInput(input.briefing);
  const openai = new OpenAI({ apiKey: input.apiKey });
  const preferenceBlock = input.preferenceBlock?.trim() || "";

  if (!notes.trim() && !(input.propertyFacts?.length) && !briefingHasContent(input.briefing)) {
    return {
      report: buildSnapshot({
        title: DEFAULT_CHAT_REPORT_TITLE,
        pros: [],
        risks: [],
        nextSteps: [],
        followUps: [],
        checklist: [],
        summary: "這則還沒有筆記。先記幾筆現場觀察，再生成報告會比較有用。",
        fingerprint,
        mediaRefs,
      }),
      extractionStatus: "ok",
    };
  }

  const completion = await openai.chat.completions.create(
    {
      model: "gpt-4o",
      temperature: 0.75,
      response_format: { type: "json_object" },
      max_tokens: 6000,
      messages: [
        {
          role: "system",
          content: [
            viewingRecorderReportRules(input.locale),
            preferenceBlock,
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
        {
          role: "user",
          content: `Address: ${input.address}

${briefingBlock}

${factsBlock}

USER_NOTES:
${notes.trim() || "(no on-site notes yet)"}

Return the ChatGPT Victory Drive template JSON: title, meta, overview, interior, outdoorLand, transitLifestyle, pricing, pros, risks, scores (items/overall/highlight/biggestQuestion), verdict, nextSteps. Include the scorecard. Do not return checklist, summary, followUps, or whatsStoppingYou.`,
        },
      ],
    },
    { signal: input.signal ?? AbortSignal.timeout(120_000) },
  );

  const raw = completion.choices[0]?.message?.content?.trim() || "{}";
  const llmParsed = parseLlmJson(raw, ChatReportLlmSchema);
  if (!llmParsed.ok) {
    return {
      report: buildSnapshot({
        pros: [],
        risks: [],
        nextSteps: [],
        followUps: [],
        checklist: [],
        summary: "報告整理暫時失敗。筆記仍保留，請再按一次生成報告。",
        fingerprint,
        mediaRefs,
      }),
      extractionStatus: "extraction_failed",
    };
  }

  const parsed = llmParsed.data;
  const title = resolveChatReportTitle(parsed.title);
  const meta = normalizeReportMeta(parsed.meta);
  const overview = parsed.overview?.trim() || "";
  const interior = parsed.interior?.trim() || "";
  const outdoorLand = parsed.outdoorLand?.trim() || "";
  const transitLifestyle = parsed.transitLifestyle?.trim() || "";
  const pricing = parsed.pricing?.trim() || "";
  const verdict = parsed.verdict?.trim() || "";
  const pros = normalizeStringList(parsed.pros, 20);
  const risks = normalizeStringList(parsed.risks, 20);
  const nextSteps = normalizeStringList(
    parsed.nextSteps?.length ? parsed.nextSteps : parsed.followUps,
    20,
  );
  const scores: ChatReportScores | undefined = normalizeReportScores(parsed.scores);

  const summary =
    assembleReportSummary({
      title,
      meta,
      overview,
      interior,
      outdoorLand,
      transitLifestyle,
      pricing,
      pros,
      risks,
      scores,
      verdict,
      nextSteps,
    }) ||
    parsed.summary?.trim() ||
    "報告已依簡介、筆記與公開資料整理。";

  return {
    report: buildSnapshot({
      title,
      meta,
      overview: overview || undefined,
      interior: interior || undefined,
      outdoorLand: outdoorLand || undefined,
      transitLifestyle: transitLifestyle || undefined,
      pricing: pricing || undefined,
      verdict: verdict || undefined,
      scores,
      pros,
      risks,
      nextSteps,
      followUps: nextSteps,
      checklist: [],
      summary,
      fingerprint,
      mediaRefs,
    }),
    extractionStatus: "ok",
  };
}
