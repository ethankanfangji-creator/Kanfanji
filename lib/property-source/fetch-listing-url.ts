/**
 * User-initiated listing URL fetch → plain text (untrusted).
 */

import { sanitizeUntrustedHtml } from "@/lib/security/untrusted-content";
import { safeFetchUserUrl } from "@/lib/security/ssrf";

export type ListingUrlExtractResult =
  | {
      ok: true;
      sourceUrl: string;
      extractedText: string;
      publisher: string | null;
      contentType: string | null;
    }
  | {
      ok: false;
      errorCode: string;
      errorMessage: string;
    };

/** Cloudflare / bot interstitial — not real listing content. */
export function looksLikeBotChallengePage(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /just a moment/.test(t) ||
    /enable javascripts? and cookies/.test(t) ||
    /checking your browser/.test(t) ||
    /attention required/.test(t) ||
    /cf-browser-verification/.test(t) ||
    /challenge-platform/.test(t) ||
    /_cf_chl/.test(t) ||
    /ddos protection by /.test(t)
  );
}

export async function fetchAndExtractListingUrl(
  rawUrl: string,
): Promise<ListingUrlExtractResult> {
  const fetched = await safeFetchUserUrl(rawUrl);
  if (!fetched.ok) {
    return {
      ok: false,
      errorCode: fetched.errorCode,
      errorMessage: fetched.errorMessage,
    };
  }

  // Raw body first — challenge markers may be stripped by HTML sanitizer.
  if (looksLikeBotChallengePage(fetched.bodyText)) {
    return {
      ok: false,
      errorCode: "login_required",
      errorMessage:
        "此房源頁面有防機器人驗證（不是要你登入本 App）。請改貼文字內容或上傳截圖。",
    };
  }

  const text = sanitizeUntrustedHtml(fetched.bodyText, { maxChars: 12_000 });
  if (looksLikeBotChallengePage(text)) {
    return {
      ok: false,
      errorCode: "login_required",
      errorMessage:
        "此房源頁面有防機器人驗證（不是要你登入本 App）。請改貼文字內容或上傳截圖。",
    };
  }
  if (text.length < 40) {
    return {
      ok: false,
      errorCode: "empty_or_dynamic",
      errorMessage:
        "無法擷取足夠的頁面文字（可能需登入或為動態頁面）。請貼上房源文字或上傳截圖。",
    };
  }

  let publisher: string | null = null;
  try {
    publisher = new URL(fetched.finalUrl).hostname;
  } catch {
    publisher = null;
  }

  return {
    ok: true,
    sourceUrl: fetched.finalUrl,
    extractedText: text,
    publisher,
    contentType: fetched.contentType,
  };
}
