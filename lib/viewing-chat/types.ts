/**
 * Viewing Chat Thread message model (Meta-AI style capture).
 */

import type { PropertyIntel } from "@/lib/property-intel/types";
import type { PropertyReport } from "@/lib/property-facts/report-types";

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
  | "intel";

export type ChatMatchedAnswer = {
  id: string;
  answer: string;
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
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  report: ChatReportSnapshot | null;
  metadata: PropertyIntel | null;
  /** Structured property report for evidence-bound AI summaries */
  propertyReport?: PropertyReport | null;
  /** Keep near top of sidebar history */
  pinned?: boolean;
};

export const DEFAULT_QUESTION_BANK: Array<Omit<QuestionBankItem, "answer" | "justDiscussed">> = [
  { id: "q_panel", category: "屋況", question: "電箱廠牌／安培數？" },
  { id: "q_leak", category: "屋況", question: "有無漏水／水漬？" },
  { id: "q_noise", category: "屋況", question: "噪音來源？（鄰居／馬路／HVAC）" },
  { id: "q_light", category: "屋況", question: "採光／朝向夠不夠？" },
  { id: "q_fees", category: "費用", question: "管理費／特別費／稅金？" },
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
