/**
 * Viewing Chat Thread message model (Meta-AI style capture).
 */

import type { PropertyIntel } from "@/lib/property-intel/types";
import type { PropertyReport } from "@/lib/property-facts/report-types";
import type {
  InitialPropertyReport,
} from "@/lib/property-source/initial-report-schema";
import type {
  PipelineStepLog,
  PropertyData,
  PropertySource,
} from "@/lib/property-source/types";
import type { PropertyChatStage } from "@/lib/viewing-chat/stage";

export type ChatMessageRole = "user" | "ai";

export type ChatMessageType =
  | "text"
  | "audio"
  | "photo"
  | "file"
  | "fill"
  | "new_card"
  | "follow_up"
  | "report"
  | "system"
  | "intel"
  | "source_status"
  | "initial_report";

export type ChatMatchedAnswer = {
  id: string;
  answer: string;
};

/** Snapshot of the message being replied to (for UI + later data tidy-up). */
export type ChatReplyRef = {
  messageId: string;
  role: ChatMessageRole;
  preview: string;
};

export type ChatReportSnapshot = {
  pros: string[];
  risks: string[];
  checklist: Array<{ id: string; question: string; answer: string; status: "ok" | "risk" | "unknown" }>;
  summary?: string;
  generatedAt: string;
};

export type ChatMessage = {
  id: string;
  role: ChatMessageRole;
  type: ChatMessageType;
  timestamp: string;
  /** Display / AI reply text */
  text?: string;
  /** Whisper transcript for audio turns */
  transcript?: string;
  /** Photo / media URL (local blob: or remote path) */
  url?: string;
  /** Attached file display name (type=file) */
  fileName?: string;
  /** When this turn is a direct reply to an earlier message */
  replyTo?: ChatReplyRef;
  /** Vision / analysis note */
  analysis?: string;
  /** Cards filled from this AI turn */
  matched?: ChatMatchedAnswer[];
  /** new_card fields */
  category?: string;
  question?: string;
  answer?: string;
  /** report bubble */
  report?: ChatReportSnapshot;
  /** property intel payload (type=intel) */
  intel?: PropertyIntel;
  /** Structured initial property analysis (type=initial_report) */
  initialReport?: InitialPropertyReport;
};

export type QuestionBankItem = {
  id: string;
  category: string;
  question: string;
  answer: string;
  /** Highlight when the latest AI turn touched this card */
  justDiscussed: boolean;
};

export type ViewingChatThread = {
  id: string;
  address: string;
  /** Normalized display address (original input stays in `address`) */
  normalizedAddress?: string | null;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  report: ChatReportSnapshot | null;
  metadata: PropertyIntel | null;
  /** Structured property report for evidence-bound AI summaries */
  propertyReport?: PropertyReport | null;
  /** Keep near top of sidebar history */
  pinned?: boolean;
  /** Collection → report stage machine */
  stage?: PropertyChatStage;
  sources?: PropertySource[];
  pipelineSteps?: PipelineStepLog[];
  propertyData?: PropertyData | null;
  initialReport?: InitialPropertyReport | null;
  /** User chose to skip listing sources for now */
  skippedSources?: boolean;
  /** On-site coaching: which checklist item is currently being asked */
  agendaActiveId?: string | null;
  /** Checklist items the user explicitly skipped */
  agendaSkippedIds?: string[];
  /** Market pack for agenda (inferred from address; US/CA/TW/OTHER) */
  agendaMarket?: "US" | "CA" | "TW" | "OTHER";
};

export const DEFAULT_QUESTION_BANK: Array<Omit<QuestionBankItem, "answer" | "justDiscussed">> = [
  { id: "q_exterior", category: "入場", question: "外觀、排水與外牆有無明顯問題？" },
  { id: "q_odor", category: "入場", question: "進門氣味如何？（霉／菸／寵物／污水）" },
  { id: "q_layout", category: "格局", question: "格局是否符合你的必備需求？" },
  { id: "q_light", category: "格局", question: "採光、通風、窗戶開關與漏風？" },
  { id: "q_water_damage", category: "屋況", question: "可見水損？天花板／窗邊／浴室" },
  { id: "q_electrical", category: "系統", question: "電箱、插座數量、潮濕區保護？" },
  { id: "q_plumbing", category: "系統", question: "開水、沖馬桶、水壓與排水速度？" },
  { id: "q_hvac", category: "系統", question: "冷暖空調屋齡、噪音、出風？" },
  { id: "q_storage_parking", category: "生活", question: "收納、車位、戶外空間夠用嗎？" },
  { id: "q_noise", category: "生活", question: "噪音來源？（車流／鄰居／電梯／管線）" },
  { id: "q_ask", category: "現場", question: "還要追問賣方／仲介什麼？" },
];

export function createMessageId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createUserMessage(
  partial: Omit<ChatMessage, "id" | "role" | "timestamp"> & { type: ChatMessageType },
): ChatMessage {
  return {
    id: createMessageId(),
    role: "user",
    timestamp: new Date().toISOString(),
    ...partial,
  };
}

export function createAiMessage(
  partial: Omit<ChatMessage, "id" | "role" | "timestamp"> & { type: ChatMessageType },
): ChatMessage {
  return {
    id: createMessageId(),
    role: "ai",
    timestamp: new Date().toISOString(),
    ...partial,
  };
}

/** Short quote text for reply previews / replyTo snapshots. */
export function messageReplyPreview(message: ChatMessage, maxLen = 80): string {
  const raw =
    message.transcript?.trim() ||
    message.text?.trim() ||
    (message.type === "photo" ? "📷" : "") ||
    (message.type === "file" ? `📎 ${message.fileName || "file"}` : "") ||
    message.question?.trim() ||
    "";
  const oneLine = raw.replace(/\s+/g, " ").trim();
  if (!oneLine) return "…";
  if (oneLine.length <= maxLen) return oneLine;
  return `${oneLine.slice(0, maxLen - 1)}…`;
}

export function toReplyRef(message: ChatMessage): ChatReplyRef {
  return {
    messageId: message.id,
    role: message.role,
    preview: messageReplyPreview(message),
  };
}

export function canReplyToMessage(message: ChatMessage): boolean {
  if (message.type === "report" || message.type === "system") return false;
  return Boolean(
    message.text?.trim() ||
      message.transcript?.trim() ||
      message.type === "photo" ||
      message.type === "file" ||
      message.question?.trim(),
  );
}

/** Concatenated searchable fields for in-chat / history search. */
export function messageSearchHaystack(message: ChatMessage): string {
  return [
    message.text,
    message.transcript,
    message.question,
    message.answer,
    message.fileName,
    message.analysis,
    message.category,
    message.replyTo?.preview,
    ...(message.matched?.map((m) => m.answer) ?? []),
  ]
    .filter(Boolean)
    .join(" ");
}
