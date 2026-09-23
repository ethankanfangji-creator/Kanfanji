/**
 * Strict Zod schema for the initial property analysis report (UI-stable JSON).
 */

import { z } from "zod";

export const VerificationStatusSchema = z.enum([
  "verified",
  "unverified",
  "inferred",
  "conflicting",
]);

export const SourcedFieldSchema = z.object({
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  normalizedValue: z.string().nullable(),
  sourceIds: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  verificationStatus: VerificationStatusSchema,
  notes: z.string(),
});

export const ReportStatusSchema = z.enum([
  "partial",
  "ready",
  "needs_confirmation",
]);

export const RiskPrioritySchema = z.enum(["high", "medium", "low"]);

export const ReportRiskSchema = z.object({
  id: z.string(),
  priority: RiskPrioritySchema,
  description: z.string(),
  rationale: z.string(),
  sourceIds: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  howToVerify: z.string(),
  askWhom: z.string(),
});

export const ReportSectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.enum([
    "summary",
    "condition",
    "costs",
    "neighborhood",
    "transportation",
    "risks",
    "checklist",
    "other",
  ]),
  body: z.string(),
  fields: z.array(SourcedFieldSchema).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const QuestionToAskSchema = z.object({
  id: z.string(),
  question: z.string(),
  askWhom: z.string(),
  priority: RiskPrioritySchema,
  relatedRiskIds: z.array(z.string()).optional(),
});

export const ViewingChecklistItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  category: z.string(),
  why: z.string(),
  status: z.enum(["pending", "ok", "risk", "unknown"]).default("pending"),
});

export const NextActionSchema = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.enum([
    "ask_agent",
    "verify_field",
    "upload_more",
    "viewing_prep",
    "follow_up",
  ]),
});

export const ReportSourceCitationSchema = z.object({
  sourceId: z.string(),
  sourceType: z.string(),
  label: z.string(),
  url: z.string().nullable().optional(),
  retrievedAt: z.string().nullable().optional(),
});

export const DataCompletenessSchema = z.object({
  score: z.number().min(0).max(1),
  missingFields: z.array(z.string()),
  verifiedFields: z.array(z.string()),
  unverifiedFields: z.array(z.string()),
});

export const PropertySummarySchema = z.object({
  address: SourcedFieldSchema.optional(),
  propertyType: SourcedFieldSchema.optional(),
  bedrooms: SourcedFieldSchema.optional(),
  bathrooms: SourcedFieldSchema.optional(),
  area: SourcedFieldSchema.optional(),
  yearBuilt: SourcedFieldSchema.optional(),
  floors: SourcedFieldSchema.optional(),
  listingType: SourcedFieldSchema.optional(),
  price: SourcedFieldSchema.optional(),
  currency: SourcedFieldSchema.optional(),
  dataRetrievedAt: z.string().nullable().optional(),
});

export const InitialPropertyReportSchema = z.object({
  reportStatus: ReportStatusSchema,
  propertySummary: PropertySummarySchema,
  dataCompleteness: DataCompletenessSchema,
  sections: z.array(ReportSectionSchema),
  risks: z.array(ReportRiskSchema),
  questionsToAsk: z.array(QuestionToAskSchema),
  viewingChecklist: z.array(ViewingChecklistItemSchema),
  nextActions: z.array(NextActionSchema),
  sources: z.array(ReportSourceCitationSchema),
  disclaimer: z.string(),
});

export type InitialPropertyReport = z.infer<typeof InitialPropertyReportSchema>;

export const DEFAULT_DISCLAIMER_ZH =
  "本報告僅供看房準備參考，非法律、估價、貸款或投資保證。無法驗證的內容已標示為未確認、推測或需向專業人士確認。";

export function parseInitialPropertyReport(
  input: unknown,
):
  | { ok: true; report: InitialPropertyReport }
  | { ok: false; error: string } {
  const parsed = InitialPropertyReportSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }
  return { ok: true, report: parsed.data };
}
