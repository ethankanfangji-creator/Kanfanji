import { NextResponse } from "next/server";
import {
  AiInputError,
  aiErrorResponse,
  assertContentLength,
  authorizeAiRequest,
  resolveAiLocale,
  validateConsent,
} from "@/lib/ai-boundary/server-entry";
import { AI_LIMITS } from "@/lib/ai-boundary/config";
import { extractTextFromPdfBase64 } from "@/lib/property-source/extract-pdf";
import { sanitizeUntrustedText } from "@/lib/security/untrusted-content";

export const runtime = "nodejs";

const MAX_NOTE_CHARS = 2_000;
const TEXT_MIME = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
]);

function dataUrlFromBuffer(mime: string, buffer: Buffer): string {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

export async function POST(request: Request) {
  try {
    assertContentLength(request);
    const form = await request.formData();
    const consent = validateConsent((key) => form.get(key));
    const boundary = await authorizeAiRequest(request, consent);
    resolveAiLocale(form.get("locale"));

    const file = form.get("file");
    if (!(file instanceof File) || file.size <= 0) {
      throw new AiInputError("file_required", 400);
    }
    if (file.size > 6_000_000) {
      throw new AiInputError("file_too_large", 413);
    }

    const mime = (file.type || "application/octet-stream").toLowerCase();
    const name = file.name || "upload";
    const buffer = Buffer.from(await file.arrayBuffer());

    if (mime === "application/pdf" || name.toLowerCase().endsWith(".pdf")) {
      const extracted = await extractTextFromPdfBase64(
        dataUrlFromBuffer("application/pdf", buffer),
      );
      if (!extracted.ok) {
        throw new AiInputError(extracted.errorCode, 422);
      }
      const text = sanitizeUntrustedText(extracted.extractedText)
        .trim()
        .slice(0, MAX_NOTE_CHARS);
      if (!text) {
        throw new AiInputError("pdf_no_text", 422);
      }
      return boundary.applyCookie(
        NextResponse.json({
          kind: "pdf",
          text,
          fileName: name,
          pageCount: extracted.pageCount,
        }),
      );
    }

    if (TEXT_MIME.has(mime) || /\.(txt|md|csv|json)$/i.test(name)) {
      if (buffer.length > AI_LIMITS.contextJsonChars * 2) {
        throw new AiInputError("file_too_large", 413);
      }
      const text = sanitizeUntrustedText(buffer.toString("utf8"))
        .trim()
        .slice(0, MAX_NOTE_CHARS);
      if (!text) {
        throw new AiInputError("file_empty", 422);
      }
      return boundary.applyCookie(
        NextResponse.json({ kind: "text", text, fileName: name }),
      );
    }

    throw new AiInputError("file_unsupported", 415);
  } catch (error) {
    return aiErrorResponse(error);
  }
}
