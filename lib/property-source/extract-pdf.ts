/**
 * PDF text extraction for user-uploaded listing / HOA documents.
 * Failures are soft — callers keep the upload as a citation source.
 */

import { extractText } from "unpdf";
import { sanitizeUntrustedText } from "@/lib/security/untrusted-content";

export type PdfExtractOk = {
  ok: true;
  extractedText: string;
  pageCount: number;
};

export type PdfExtractErr = {
  ok: false;
  errorCode:
    | "pdf_empty"
    | "pdf_no_text"
    | "pdf_extract_failed"
    | "pdf_too_large";
  errorMessage: string;
};

export type PdfExtractResult = PdfExtractOk | PdfExtractErr;

const MAX_PDF_BYTES = 6_000_000;
const MAX_TEXT_CHARS = 20_000;

export async function extractTextFromPdfBase64(
  fileBase64: string,
): Promise<PdfExtractResult> {
  const raw = stripDataUrl(fileBase64);
  if (!raw) {
    return {
      ok: false,
      errorCode: "pdf_empty",
      errorMessage: "PDF 是空的，請重新上傳或改貼文字。",
    };
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(raw, "base64");
  } catch {
    return {
      ok: false,
      errorCode: "pdf_extract_failed",
      errorMessage: "無法解碼 PDF，請重新上傳或改貼文字。",
    };
  }

  if (buffer.length <= 0) {
    return {
      ok: false,
      errorCode: "pdf_empty",
      errorMessage: "PDF 是空的，請重新上傳或改貼文字。",
    };
  }
  if (buffer.length > MAX_PDF_BYTES) {
    return {
      ok: false,
      errorCode: "pdf_too_large",
      errorMessage: "PDF 太大，請改貼重點文字或上傳截圖。",
    };
  }

  try {
    const result = await extractText(new Uint8Array(buffer), {
      mergePages: true,
    });
    const merged = result.text;
    const cleaned = sanitizeUntrustedText(merged, { maxChars: MAX_TEXT_CHARS });
    if (!cleaned.trim()) {
      return {
        ok: false,
        errorCode: "pdf_no_text",
        errorMessage:
          "此 PDF 幾乎沒有可抽取文字（可能是掃描影像）。請改貼文字或上傳截圖。",
      };
    }
    return {
      ok: true,
      extractedText: cleaned,
      pageCount: result.totalPages ?? 1,
    };
  } catch {
    return {
      ok: false,
      errorCode: "pdf_extract_failed",
      errorMessage: "無法自動抽取 PDF 文字，請改貼重點文字或上傳截圖。",
    };
  }
}

function stripDataUrl(input: string): string {
  const m = input.match(/^data:[^;]+;base64,(.+)$/i);
  return m ? m[1] : input;
}
