/**
 * Observable property-source pipeline.
 * Single-step failures do not abort the whole run.
 */

import { sanitizeUntrustedText } from "@/lib/security/untrusted-content";
import { MEDIA_IMPORT_LIMITS } from "@/lib/media-import";
import { fetchAndExtractListingUrl } from "./fetch-listing-url";
import { extractFactsFromText, mergePropertyData } from "./extract-text";
import { extractTextFromPdfBase64 } from "./extract-pdf";
import { isVisionApiConfigured } from "./extract-vision";
import {
  countFilledCoreFields,
  detectValueConflicts,
  type FieldConflict,
} from "./completeness";
import { buildInitialPropertyReport } from "./build-report";
import type { InitialPropertyReport } from "./initial-report-schema";
import {
  createEmptyPropertyData,
  createPendingStepLogs,
  createSourceId,
  sourcedField,
  type PipelineStepLog,
  type PipelineStepName,
  type PropertyData,
  type PropertySource,
  type PropertySourceRole,
  type PropertySourceType,
} from "./types";

export type IngestInput = {
  sourceType: PropertySourceType;
  text?: string;
  url?: string;
  /** base64 without data: prefix, or full data URL */
  fileBase64?: string;
  mimeType?: string;
  fileName?: string;
  address: string;
  locale?: string;
  existingSources?: PropertySource[];
  existingData?: PropertyData | null;
  /** Semantic role for uploads (HOA docs, etc.) */
  sourceRole?: PropertySourceRole | null;
  /** Optional vision extract callback (injected for tests / route) */
  visionExtract?: (args: {
    base64: string;
    mime: string;
    locale: string;
  }) => Promise<{
    extractedText: string;
    observedConditions: string[];
    uncertainItems: string[];
    confidence: number;
  } | null>;
  /** Optional enrich (property-facts); failures become notes */
  enrich?: (address: string) => Promise<{
    notes: string[];
    patch?: Partial<PropertyData> | PropertyData | null;
  }>;
};

export type PipelineResult = {
  source: PropertySource;
  sources: PropertySource[];
  propertyData: PropertyData;
  steps: PipelineStepLog[];
  conflicts: FieldConflict[];
  report: InitialPropertyReport | null;
  enrichNotes: string[];
};

function touchStep(
  steps: PipelineStepLog[],
  step: PipelineStepName,
  patch: Partial<PipelineStepLog>,
) {
  const i = steps.findIndex((s) => s.step === step);
  if (i < 0) return;
  steps[i] = { ...steps[i], ...patch };
}

function startStep(steps: PipelineStepLog[], step: PipelineStepName, sourceId: string) {
  touchStep(steps, step, {
    status: "running",
    startedAt: new Date().toISOString(),
    sourceReferences: [sourceId],
  });
}

function completeStep(steps: PipelineStepLog[], step: PipelineStepName) {
  touchStep(steps, step, {
    status: "completed",
    completedAt: new Date().toISOString(),
  });
}

function failStep(
  steps: PipelineStepLog[],
  step: PipelineStepName,
  errorCode: string,
  errorMessage: string,
) {
  touchStep(steps, step, {
    status: "error",
    completedAt: new Date().toISOString(),
    errorCode,
    errorMessage,
  });
}

function skipStep(steps: PipelineStepLog[], step: PipelineStepName, reason: string) {
  touchStep(steps, step, {
    status: "skipped",
    completedAt: new Date().toISOString(),
    errorMessage: reason,
  });
}

export async function runPropertySourcePipeline(
  input: IngestInput,
): Promise<PipelineResult> {
  const steps = createPendingStepLogs();
  const sourceId = createSourceId();
  const now = new Date().toISOString();
  const sources = [...(input.existingSources ?? [])];
  let propertyData = input.existingData
    ? structuredClone(input.existingData)
    : createEmptyPropertyData(input.address);
  if (!propertyData.location.inputAddress) {
    propertyData.location.inputAddress = input.address;
  }

  const source: PropertySource = {
    sourceId,
    sourceType: input.sourceType,
    originalContent: "",
    extractedText: null,
    sourceUrl: input.url ?? null,
    publisher: null,
    retrievedAt: now,
    country: null,
    language: input.locale ?? null,
    confidence: 0,
    extractionErrors: [],
    mimeType: input.mimeType ?? null,
    fileName: input.fileName ?? null,
    sourceRole: input.sourceRole ?? null,
  };

  // ingest
  startStep(steps, "ingest", sourceId);
  if (input.sourceType === "listing_url") {
    source.originalContent = (input.url ?? "").trim();
  } else if (input.sourceType === "user_text" || input.sourceType === "chat_message") {
    source.originalContent = (input.text ?? "").trim();
  } else {
    source.originalContent = input.fileName || input.mimeType || "upload";
  }
  completeStep(steps, "ingest");

  // validate
  startStep(steps, "validate", sourceId);
  try {
    if (input.sourceType === "listing_url") {
      if (!input.url?.trim()) throw new Error("missing_url");
    } else if (
      input.sourceType === "user_text" ||
      input.sourceType === "chat_message"
    ) {
      if (!input.text?.trim()) throw new Error("missing_text");
      if (input.text.length > 50_000) throw new Error("text_too_large");
    } else if (input.sourceType === "image") {
      const mime = (input.mimeType ?? "").toLowerCase();
      if (mime === "image/heic" || mime === "image/heif") {
        throw new Error("invalid_image_mime");
      }
      if (
        !["image/jpeg", "image/png", "image/webp", "image/jpg"].includes(mime)
      ) {
        throw new Error("invalid_image_mime");
      }
      const b64 = stripDataUrl(input.fileBase64 ?? "");
      const bytes = Math.floor((b64.length * 3) / 4);
      if (bytes <= 0) throw new Error("empty_file");
      if (bytes > MEDIA_IMPORT_LIMITS.photoBytes) throw new Error("image_too_large");
    } else if (input.sourceType === "pdf") {
      const mime = (input.mimeType ?? "").toLowerCase();
      if (mime && mime !== "application/pdf") throw new Error("invalid_pdf_mime");
      const b64 = stripDataUrl(input.fileBase64 ?? "");
      if (!b64) throw new Error("empty_file");
      if (b64.length > 8_000_000) throw new Error("pdf_too_large");
    }
    completeStep(steps, "validate");
  } catch (e) {
    const code = e instanceof Error ? e.message : "validate_failed";
    failStep(steps, "validate", code, validateMessage(code));
    source.extractionErrors.push(code);
    sources.push(source);
    return {
      source,
      sources,
      propertyData,
      steps,
      conflicts: [],
      report: null,
      enrichNotes: [],
    };
  }

  // extract
  startStep(steps, "extract", sourceId);
  let extractedText = "";
  const softFailNotes: string[] = [];
  try {
    if (input.sourceType === "listing_url") {
      const rawUrl = (input.url ?? "").trim();
      // Always keep the URL as a citation source, even when the page blocks fetch.
      source.sourceUrl = rawUrl || source.sourceUrl;
      try {
        source.publisher = rawUrl ? new URL(rawUrl).hostname : null;
      } catch {
        source.publisher = source.publisher;
      }
      const fetched = await fetchAndExtractListingUrl(rawUrl);
      if (!fetched.ok) {
        failStep(steps, "extract", fetched.errorCode, fetched.errorMessage);
        source.extractionErrors.push(fetched.errorCode);
        // Soft-fail: URL still counts; low confidence; page body not obtained.
        source.confidence = 0.15;
        source.extractedText = null;
        softFailNotes.push(
          "房源連結已記錄，但目標網站不開放直接讀取頁面內容（非本 App 登入問題）。",
        );
      } else {
        extractedText = fetched.extractedText;
        source.sourceUrl = fetched.sourceUrl;
        source.publisher = fetched.publisher;
        source.extractedText = extractedText;
        source.confidence = 0.55;
        completeStep(steps, "extract");
      }
    } else if (
      input.sourceType === "user_text" ||
      input.sourceType === "chat_message"
    ) {
      extractedText = sanitizeUntrustedText(input.text!, { maxChars: 20_000 });
      source.extractedText = extractedText;
      source.originalContent = extractedText;
      source.confidence = 0.7;
      completeStep(steps, "extract");
    } else if (input.sourceType === "image") {
      if (input.visionExtract && input.fileBase64) {
        if (!isVisionApiConfigured()) {
          failStep(
            steps,
            "extract",
            "vision_key_missing",
            "AI 影像分析未設定金鑰（OPENAI_API_KEY），請改貼文字或稍後再試。",
          );
          source.extractionErrors.push("vision_key_missing");
          source.confidence = 0.2;
          softFailNotes.push(
            "圖片已記錄，但 AI 影像分析未設定金鑰，無法自動 OCR。",
          );
        } else {
          const vision = await input.visionExtract({
            base64: stripDataUrl(input.fileBase64),
            mime: input.mimeType || "image/jpeg",
            locale: input.locale || "zh-Hant",
          });
          if (vision) {
            const hasText = Boolean(vision.extractedText?.trim());
            const hasObs =
              vision.observedConditions.length > 0 ||
              vision.uncertainItems.length > 0;
            extractedText = vision.extractedText?.trim() ?? "";
            source.extractedText = extractedText || null;
            source.confidence = vision.confidence;
            for (const obs of vision.observedConditions) {
              propertyData.condition.photoObservations.push(
                sourcedField(obs, {
                  sourceIds: [sourceId],
                  confidence: vision.confidence,
                  verificationStatus: "inferred",
                  notes: "Vision observation — needs on-site confirmation",
                }),
              );
            }
            for (const u of vision.uncertainItems) {
              propertyData.condition.unverifiableFromPhotos.push(
                sourcedField(u, {
                  sourceIds: [sourceId],
                  confidence: 0.4,
                  verificationStatus: "inferred",
                }),
              );
            }
            propertyData.condition.conditionConfidence = Math.max(
              propertyData.condition.conditionConfidence,
              vision.confidence,
            );
            if (!hasText && !hasObs) {
              failStep(
                steps,
                "extract",
                "vision_no_text",
                "圖片已記錄，但看不清可讀文字。請換更清楚的房源截圖，或改貼文字。",
              );
              source.extractionErrors.push("vision_no_text");
              softFailNotes.push(
                "圖片已記錄，但 OCR 未讀到文字；可改貼房源文字補強。",
              );
            } else {
              completeStep(steps, "extract");
              if (!hasText && hasObs) {
                softFailNotes.push(
                  "已從照片記下屋況觀察（推測），但幾乎沒有 OCR 到房源文字；若是截圖請換更清楚的圖或改貼文字。",
                );
              }
            }
          } else {
            failStep(
              steps,
              "extract",
              "vision_unavailable",
              "圖片分析暫時無法使用，請改貼文字或稍後再試。",
            );
            source.extractionErrors.push("vision_unavailable");
            softFailNotes.push("圖片已記錄，但影像分析暫時無法使用。");
          }
        }
      } else {
        skipStep(steps, "extract", "vision_not_configured");
        source.extractionErrors.push("vision_not_configured");
        source.confidence = 0.2;
        softFailNotes.push("圖片已記錄，但此次請求未啟用影像分析。");
      }
    } else if (input.sourceType === "pdf") {
      if (!input.fileBase64) {
        failStep(steps, "extract", "pdf_empty", "PDF 是空的，請重新上傳。");
        source.extractionErrors.push("pdf_empty");
      } else {
        const pdf = await extractTextFromPdfBase64(input.fileBase64);
        if (pdf.ok) {
          extractedText = pdf.extractedText;
          source.extractedText = extractedText;
          source.confidence = input.sourceRole === "hoa_doc" ? 0.55 : 0.5;
          completeStep(steps, "extract");
        } else {
          failStep(steps, "extract", pdf.errorCode, pdf.errorMessage);
          source.extractionErrors.push(pdf.errorCode);
          source.confidence = 0.2;
          softFailNotes.push(
            "PDF 已記錄，但無法自動抽字。請改貼重點文字或上傳截圖。",
          );
        }
      }
    }
  } catch (e) {
    failStep(
      steps,
      "extract",
      "extract_failed",
      e instanceof Error ? e.message : "extract_failed",
    );
    source.extractionErrors.push("extract_failed");
  }

  // normalize + classify from text
  const allCandidates: Array<{ path: string; value: unknown; sourceId: string }> =
    [];
  startStep(steps, "normalize", sourceId);
  startStep(steps, "classify", sourceId);
  if (extractedText) {
    const patch = extractFactsFromText(extractedText, {
      sourceId,
      inputAddress: input.address,
    });
    propertyData = mergePropertyData(propertyData, patch.data);
    allCandidates.push(...patch.candidates);

    // HOA / management fee docs: prefer writing fee + human-verify notes
    if (input.sourceRole === "hoa_doc") {
      if (propertyData.costs.hoaOrManagementFee.value) {
        propertyData.costs.hoaOrManagementFee = {
          ...propertyData.costs.hoaOrManagementFee,
          verificationStatus: "unverified",
          notes:
            propertyData.costs.hoaOrManagementFee.notes ||
            "From user-uploaded HOA / management document — confirm against official fee schedule",
        };
      } else {
        // Keep a note that fee was not auto-parsed
        softFailNotes.push(
          "已上傳管理費／HOA 文件；若未自動讀到金額，請在文字中標明「管理費：…」或向仲介確認。",
        );
      }
    }

    completeStep(steps, "normalize");
    completeStep(steps, "classify");
  } else {
    skipStep(steps, "normalize", "no_extracted_text");
    skipStep(steps, "classify", "no_extracted_text");
  }

  sources.push(source);

  // enrich
  const enrichNotes: string[] = [...softFailNotes];
  startStep(steps, "enrich", sourceId);
  if (input.enrich) {
    try {
      const enriched = await input.enrich(input.address);
      enrichNotes.push(...enriched.notes);
      if (enriched.patch) {
        propertyData = mergePropertyData(
          propertyData,
          enriched.patch as PropertyData,
        );
      }
      completeStep(steps, "enrich");
    } catch (e) {
      failStep(
        steps,
        "enrich",
        "enrich_failed",
        e instanceof Error ? e.message : "enrich_failed",
      );
      enrichNotes.push("外部資料暫時不可用，已保留既有房源資料。");
    }
  } else {
    skipStep(steps, "enrich", "enrich_not_configured");
    enrichNotes.push("外部資料尚未連接或未在此次請求中執行。");
  }

  // crossCheck
  startStep(steps, "crossCheck", sourceId);
  const conflicts = detectValueConflicts(allCandidates);
  if (conflicts.length) {
    for (const c of conflicts) {
      // mark listing price etc. if path matches — lightweight
      if (c.path === "listing.price" && propertyData.listing.price.value != null) {
        propertyData.listing.price = {
          ...propertyData.listing.price,
          verificationStatus: "conflicting",
          notes: `Conflict across sources: ${c.values.map((v) => String(v.value)).join(" vs ")}`,
        };
      }
    }
  }
  completeStep(steps, "crossCheck");

  // score
  startStep(steps, "score", sourceId);
  const coreCount = countFilledCoreFields(propertyData);
  completeStep(steps, "score");

  // summarize / report / followup
  startStep(steps, "summarize", sourceId);
  completeStep(steps, "summarize");

  startStep(steps, "report", sourceId);
  let report: InitialPropertyReport | null = null;
  try {
    report = buildInitialPropertyReport({
      address: input.address,
      data: propertyData,
      sources,
      conflicts,
      enrichNotes,
      locale: input.locale,
    });
    completeStep(steps, "report");
  } catch (e) {
    failStep(
      steps,
      "report",
      "report_failed",
      e instanceof Error ? e.message : "report_failed",
    );
  }

  startStep(steps, "followup", sourceId);
  if (report) completeStep(steps, "followup");
  else skipStep(steps, "followup", "no_report");

  void coreCount;
  return {
    source,
    sources,
    propertyData,
    steps,
    conflicts,
    report,
    enrichNotes,
  };
}

function stripDataUrl(input: string): string {
  const m = input.match(/^data:[^;]+;base64,(.+)$/i);
  return m ? m[1] : input;
}

function validateMessage(code: string): string {
  switch (code) {
    case "missing_url":
      return "請提供房源連結。";
    case "missing_text":
      return "請貼上房源文字。";
    case "text_too_large":
      return "文字過長，請精簡後再送出。";
    case "invalid_image_mime":
      return "僅支援 JPG、PNG 或 WEBP 圖片。";
    case "invalid_pdf_mime":
      return "僅支援 PDF 檔案。";
    case "empty_file":
      return "檔案是空的，請重新上傳。";
    case "image_too_large":
      return "圖片太大，請壓縮後再上傳。";
    case "pdf_too_large":
      return "PDF 太大，請改貼文字或截圖。";
    default:
      return "資料驗證失敗，請調整後再試。";
  }
}
