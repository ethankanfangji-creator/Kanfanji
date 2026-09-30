import { NextResponse } from "next/server";
import {
  AiInputError,
  aiErrorResponse,
  assertContentLength,
} from "@/lib/ai-boundary/server-entry";
import { AI_LIMITS } from "@/lib/ai-boundary/config";
import { consumeAiQuota } from "@/lib/ai-boundary/quota";
import { getAccountTier } from "@/lib/entitlement/tier";
import { requestListingExtract, type ListingExtract } from "@/lib/listing-extract";
import { ListingSaveError, saveListingOnProperty } from "@/lib/listing-extract-save";
import { extractTextFromPdfBase64 } from "@/lib/property-source/extract-pdf";
import { fetchAndExtractListingUrl } from "@/lib/property-source/fetch-listing-url";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

const VIEWING_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

type PreparedSource =
  | { kind: "text"; text: string; sourceUrl: string | null; photoUrls: string[] }
  | { kind: "image"; text: string; sourceUrl: null; image: { base64: string; mime: string } };

function quotaError(quota: Awaited<ReturnType<typeof consumeAiQuota>>) {
  if (quota.allowed) return null;
  const status = quota.code === "ai_quota_exceeded" ? 429 : 503;
  const error = new AiInputError(quota.code, status);
  if (quota.code === "ai_quota_exceeded") {
    Object.assign(error, {
      tier: quota.tier,
      limit: quota.limit,
      resetsAt: quota.resetsAt,
      retryAfter: quota.retryAfter,
    });
  } else {
    Object.assign(error, { retryAfter: quota.retryAfter });
  }
  return error;
}

async function readInput(request: Request): Promise<{ viewingId: string; source: PreparedSource }> {
  const contentType = request.headers.get("content-type") || "";
  let viewingId = "";
  let listingUrl = "";
  let file: File | null = null;

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    viewingId = String(form.get("viewing_id") || "").trim();
    listingUrl = String(form.get("listing_url") || "").trim();
    const uploaded = form.get("file");
    if (uploaded instanceof File && uploaded.size > 0) file = uploaded;
  } else {
    const body = (await request.json()) as Record<string, unknown>;
    viewingId = typeof body.viewing_id === "string" ? body.viewing_id.trim() : "";
    listingUrl = typeof body.listing_url === "string" ? body.listing_url.trim() : "";
  }

  if (!VIEWING_ID.test(viewingId)) throw new AiInputError("json_invalid", 400);
  const hasUrl = listingUrl.length > 0;
  const hasFile = file != null;
  if (hasUrl === hasFile) throw new AiInputError("json_invalid", 400);

  if (hasUrl) {
    const fetched = await fetchAndExtractListingUrl(listingUrl);
    if (!fetched.ok) {
      throw Object.assign(new Error(fetched.errorMessage), {
        status: 422,
        code: fetched.errorCode,
        publicMessage: fetched.errorMessage,
      });
    }
    const photoNote = fetched.photoUrls.length
      ? `\nImage URLs:\n${fetched.photoUrls.join("\n")}`
      : "";
    return {
      viewingId,
      source: {
        kind: "text",
        text: `${fetched.extractedText}${photoNote}`,
        sourceUrl: fetched.sourceUrl,
        photoUrls: fetched.photoUrls,
      },
    };
  }

  const mime = (file!.type || "").toLowerCase() === "image/jpg" ? "image/jpeg" : (file!.type || "").toLowerCase();
  const buffer = Buffer.from(await file!.arrayBuffer());
  if (mime === "application/pdf") {
    const extracted = await extractTextFromPdfBase64(buffer.toString("base64"));
    if (!extracted.ok) {
      throw Object.assign(new Error(extracted.errorMessage), {
        status: 422,
        code: extracted.errorCode,
        publicMessage: extracted.errorMessage,
      });
    }
    return {
      viewingId,
      source: { kind: "text", text: extracted.extractedText, sourceUrl: null, photoUrls: [] },
    };
  }

  if (!IMAGE_MIME.has(mime)) throw new AiInputError("image_mime_invalid", 415);
  if (buffer.length > AI_LIMITS.imageBytes) throw new AiInputError("image_too_large", 413);
  return {
    viewingId,
    source: {
      kind: "image",
      text: "Extract facts visible in this listing photo.",
      sourceUrl: null,
      image: { base64: buffer.toString("base64"), mime },
    },
  };
}

function sourceErrorResponse(error: unknown): NextResponse | null {
  if (!(error instanceof Error)) return null;
  const extra = error as Error & { status?: number; code?: string; publicMessage?: string };
  if (extra.status !== 422 || !extra.publicMessage) return null;
  return NextResponse.json(
    { error: extra.publicMessage, code: extra.code ?? "extract_failed" },
    { status: 422 },
  );
}

export async function POST(request: Request) {
  try {
    assertContentLength(request);
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "請先登入" }, { status: 401 });
    }

    const { viewingId, source } = await readInput(request);
    const admin = createAdminClient();
    const { data: viewing, error: viewingError } = await admin
      .from("viewings")
      .select("id, user_id, property_id, address, property")
      .eq("id", viewingId)
      .maybeSingle();
    if (viewingError) throw new Error(viewingError.message);
    if (!viewing || viewing.user_id !== user.id) {
      return NextResponse.json({ error: "找不到這筆看房" }, { status: 404 });
    }

    let tier: "free" | "pro" = "free";
    try {
      tier = await getAccountTier(admin, user.id);
    } catch {
      tier = "free";
    }
    const quota = await consumeAiQuota(request, { kind: "user", userId: user.id, tier });
    const blocked = quotaError(quota);
    if (blocked) throw blocked;

    const listing = await requestListingExtract({
      text: source.text,
      sourceUrl: source.sourceUrl,
      image: source.kind === "image" ? source.image : null,
    });
    if (listing.photos.length === 0 && source.kind === "text" && source.photoUrls.length > 0) {
      listing.photos = source.photoUrls;
    }

    const propertyId = await saveListingOnProperty(
      admin,
      {
        id: viewing.id,
        user_id: viewing.user_id,
        property_id: viewing.property_id,
        address: viewing.address,
        property:
          viewing.property && typeof viewing.property === "object"
            ? (viewing.property as Record<string, unknown>)
            : null,
      },
      listing,
    );

    return NextResponse.json({ listing: listing satisfies ListingExtract, propertyId });
  } catch (error) {
    const sourceError = sourceErrorResponse(error);
    if (sourceError) return sourceError;
    if (error instanceof ListingSaveError) {
      const message =
        error.code === "missing_property"
          ? "這筆看房還沒有物件，無法存檔。"
          : "抽出的資料沒有存進物件。";
      return NextResponse.json({ error: message, code: error.code }, { status: 422 });
    }
    return aiErrorResponse(error);
  }
}
