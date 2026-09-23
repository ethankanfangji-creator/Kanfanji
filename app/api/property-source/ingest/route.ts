import { NextResponse } from "next/server";
import {
  AiInputError,
  aiErrorResponse,
  assertContentLength,
  authorizeAiRequest,
  validateConsent,
} from "@/lib/ai-boundary/server-entry";
import { AI_LIMITS } from "@/lib/ai-boundary/config";
import { runPropertySourcePipeline } from "@/lib/property-source/pipeline";
import { extractPropertyFromImage } from "@/lib/property-source/extract-vision";
import { enrichPropertyDataFromFactCard } from "@/lib/property-source/enrich-from-facts";
import type {
  PropertyData,
  PropertySource,
  PropertySourceRole,
  PropertySourceType,
} from "@/lib/property-source/types";
import { assemblePropertyFacts } from "@/lib/property-facts/orchestrator";

export const runtime = "nodejs";

const SOURCE_TYPES: PropertySourceType[] = [
  "listing_url",
  "user_text",
  "image",
  "pdf",
  "chat_message",
];

const SOURCE_ROLES: PropertySourceRole[] = ["listing", "hoa_doc", "other"];

export async function POST(request: Request) {
  try {
    assertContentLength(request);
    const contentType = request.headers.get("content-type") || "";

    let consentFields: Record<string, unknown> = {};
    let sourceType: PropertySourceType = "user_text";
    let sourceRole: PropertySourceRole | null = null;
    let address = "";
    let locale = "zh-Hant";
    let text: string | undefined;
    let url: string | undefined;
    let fileBase64: string | undefined;
    let mimeType: string | undefined;
    let fileName: string | undefined;
    let existingSources: PropertySource[] = [];
    let existingData: PropertyData | null = null;
    let runEnrich = true;

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      consentFields = {
        consentVersion: form.get("consentVersion"),
        consentSessionId: form.get("consentSessionId"),
        identityKind: form.get("identityKind"),
      };
      sourceType = String(form.get("sourceType") || "image") as PropertySourceType;
      const roleRaw = form.get("sourceRole");
      if (typeof roleRaw === "string" && SOURCE_ROLES.includes(roleRaw as PropertySourceRole)) {
        sourceRole = roleRaw as PropertySourceRole;
      }
      address = String(form.get("address") || "").trim();
      locale = String(form.get("locale") || "zh-Hant");
      text = form.get("text") ? String(form.get("text")) : undefined;
      url = form.get("url") ? String(form.get("url")) : undefined;
      fileName = form.get("fileName") ? String(form.get("fileName")) : undefined;
      runEnrich = form.get("runEnrich") !== "false";
      const existingSourcesRaw = form.get("existingSources");
      if (typeof existingSourcesRaw === "string" && existingSourcesRaw) {
        existingSources = JSON.parse(existingSourcesRaw) as PropertySource[];
      }
      const existingDataRaw = form.get("existingData");
      if (typeof existingDataRaw === "string" && existingDataRaw) {
        existingData = JSON.parse(existingDataRaw) as PropertyData;
      }
      const file = form.get("file");
      if (file instanceof File) {
        mimeType = file.type || "application/octet-stream";
        fileName = fileName || file.name;
        const buf = Buffer.from(await file.arrayBuffer());
        fileBase64 = buf.toString("base64");
        if (mimeType.startsWith("image/")) sourceType = "image";
        else if (mimeType === "application/pdf") sourceType = "pdf";
      }
    } else {
      const body = (await request.json()) as Record<string, unknown>;
      consentFields = body;
      sourceType = String(body.sourceType || "user_text") as PropertySourceType;
      if (
        typeof body.sourceRole === "string" &&
        SOURCE_ROLES.includes(body.sourceRole as PropertySourceRole)
      ) {
        sourceRole = body.sourceRole as PropertySourceRole;
      }
      address = typeof body.address === "string" ? body.address.trim() : "";
      locale = typeof body.locale === "string" ? body.locale : "zh-Hant";
      text = typeof body.text === "string" ? body.text : undefined;
      url = typeof body.url === "string" ? body.url : undefined;
      fileBase64 = typeof body.fileBase64 === "string" ? body.fileBase64 : undefined;
      mimeType = typeof body.mimeType === "string" ? body.mimeType : undefined;
      fileName = typeof body.fileName === "string" ? body.fileName : undefined;
      runEnrich = body.runEnrich !== false;
      if (Array.isArray(body.existingSources)) {
        existingSources = body.existingSources as PropertySource[];
      }
      if (body.existingData && typeof body.existingData === "object") {
        existingData = body.existingData as PropertyData;
      }
    }

    const consent = validateConsent((key) => consentFields[key]);
    const boundary = await authorizeAiRequest(request, consent);

    if (!address || address.length > 500) {
      throw new AiInputError("address_invalid");
    }
    if (!SOURCE_TYPES.includes(sourceType)) {
      throw new AiInputError("json_invalid");
    }
    if (existingSources.length > 40) {
      throw new AiInputError("context_invalid");
    }

    // Normalize image base64 to raw if data URL provided
    if (fileBase64?.startsWith("data:")) {
      const match = fileBase64.match(
        /^data:(image\/(?:jpeg|png|webp)|application\/pdf);base64,([A-Za-z0-9+/]+={0,2})$/i,
      );
      if (!match) throw new AiInputError("image_mime_invalid", 415);
      mimeType = mimeType || match[1];
      fileBase64 = match[2];
      if (fileBase64.length > AI_LIMITS.imageBase64Chars) {
        throw new AiInputError("image_too_large", 413);
      }
    }

    const result = await runPropertySourcePipeline({
      sourceType,
      sourceRole,
      text,
      url,
      fileBase64,
      mimeType,
      fileName,
      address,
      locale,
      existingSources,
      existingData,
      visionExtract:
        sourceType === "image"
          ? async ({ base64, mime, locale: loc }) =>
              extractPropertyFromImage({ base64, mime, locale: loc })
          : undefined,
      enrich: runEnrich
        ? async (addr) => {
            try {
              const card = await assemblePropertyFacts({ address: addr });
              return enrichPropertyDataFromFactCard(card);
            } catch {
              return {
                notes: ["外部資料暫時不可用，已保留使用者提供的房源資料。"],
                patch: null,
              };
            }
          }
        : undefined,
    });

    return boundary.applyCookie(
      NextResponse.json({
        source: result.source,
        sources: result.sources,
        propertyData: result.propertyData,
        steps: result.steps,
        conflicts: result.conflicts,
        report: result.report,
        enrichNotes: result.enrichNotes,
      }),
    );
  } catch (error) {
    return aiErrorResponse(error);
  }
}
