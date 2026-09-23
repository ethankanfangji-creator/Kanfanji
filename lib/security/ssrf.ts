/**
 * SSRF guards for user-initiated URL fetches.
 * Blocks private/link-local/metadata hosts and non-http(s) schemes.
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
]);

const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_BYTES = 1_500_000;
/** Soft bot walls often allow HTML through with a browser UA. */
export const DEFAULT_BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
/** Minimum HTML length before treating a 403 body as usable extract. */
const MIN_FORBIDDEN_BODY_CHARS = 400;

export type SsrfCheckResult =
  | { ok: true; url: URL }
  | { ok: false; errorCode: string; errorMessage: string };

export function assertSafeHttpUrl(raw: string): SsrfCheckResult {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return {
      ok: false,
      errorCode: "invalid_url",
      errorMessage: "網址格式不正確，請確認後再試。",
    };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return {
      ok: false,
      errorCode: "scheme_not_allowed",
      errorMessage: "僅支援 http 或 https 連結。",
    };
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) {
    return {
      ok: false,
      errorCode: "invalid_host",
      errorMessage: "缺少有效主機名稱。",
    };
  }

  if (BLOCKED_HOSTS.has(host) || host.endsWith(".localhost") || host.endsWith(".local")) {
    return {
      ok: false,
      errorCode: "host_blocked",
      errorMessage: "此網址無法用於擷取（本機或受保護位址）。",
    };
  }

  if (host === "0.0.0.0" || host === "::" || host === "[::]") {
    return {
      ok: false,
      errorCode: "host_blocked",
      errorMessage: "此網址無法用於擷取。",
    };
  }

  const ipVersion = isIP(host.replace(/^\[|\]$/g, ""));
  if (ipVersion && isPrivateOrReservedIp(host.replace(/^\[|\]$/g, ""))) {
    return {
      ok: false,
      errorCode: "private_ip",
      errorMessage: "不允許擷取內網或保留 IP 位址。",
    };
  }

  return { ok: true, url };
}

/** IPv4 / IPv6 private, loopback, link-local, CGNAT, metadata ranges. */
export function isPrivateOrReservedIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const parts = ip.split(".").map((x) => Number(x));
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return true;
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  if (v === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA
    if (lower.startsWith("fe80")) return true; // link-local
    if (lower.startsWith("ff")) return true; // multicast
    // IPv4-mapped
    if (lower.startsWith("::ffff:")) {
      const mapped = lower.slice("::ffff:".length);
      if (isIP(mapped) === 4) return isPrivateOrReservedIp(mapped);
    }
    return false;
  }
  return true;
}

export async function resolveAndAssertPublicHost(
  hostname: string,
): Promise<SsrfCheckResult> {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  const literal = host.replace(/^\[|\]$/g, "");
  if (isIP(literal)) {
    if (isPrivateOrReservedIp(literal)) {
      return {
        ok: false,
        errorCode: "private_ip",
        errorMessage: "不允許擷取內網或保留 IP 位址。",
      };
    }
    return { ok: true, url: new URL(`https://${host}/`) };
  }

  try {
    const records = await lookup(host, { all: true, verbatim: true });
    if (!records.length) {
      return {
        ok: false,
        errorCode: "dns_failed",
        errorMessage: "無法解析此網址的主機名稱。",
      };
    }
    for (const r of records) {
      if (isPrivateOrReservedIp(r.address)) {
        return {
          ok: false,
          errorCode: "private_ip",
          errorMessage: "此網址解析到內網位址，已拒絕擷取。",
        };
      }
    }
  } catch {
    return {
      ok: false,
      errorCode: "dns_failed",
      errorMessage: "無法解析此網址的主機名稱。",
    };
  }

  return { ok: true, url: new URL(`https://${host}/`) };
}

export type SafeFetchOptions = {
  timeoutMs?: number;
  maxBytes?: number;
  userAgent?: string;
};

export type SafeFetchResult =
  | {
      ok: true;
      finalUrl: string;
      contentType: string | null;
      bodyText: string;
      status: number;
    }
  | {
      ok: false;
      errorCode: string;
      errorMessage: string;
      status?: number;
    };

/**
 * Fetch a user-provided URL with SSRF checks, redirect limits, and size cap.
 * Response body is returned as text (caller sanitizes).
 */
export async function safeFetchUserUrl(
  rawUrl: string,
  opts: SafeFetchOptions = {},
): Promise<SafeFetchResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const ua = opts.userAgent ?? DEFAULT_BROWSER_UA;

  let current = assertSafeHttpUrl(rawUrl);
  if (!current.ok) {
    return {
      ok: false,
      errorCode: current.errorCode,
      errorMessage: current.errorMessage,
    };
  }

  let url = current.url;

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
    const dns = await resolveAndAssertPublicHost(url.hostname);
    if (!dns.ok) {
      return { ok: false, errorCode: dns.errorCode, errorMessage: dns.errorMessage };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": ua,
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
        },
      });

      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const loc = res.headers.get("location");
        if (!loc) {
          return {
            ok: false,
            errorCode: "redirect_missing",
            errorMessage: "網頁重新導向但缺少目標位址。",
            status: res.status,
          };
        }
        const next = assertSafeHttpUrl(new URL(loc, url).toString());
        if (!next.ok) {
          return {
            ok: false,
            errorCode: next.errorCode,
            errorMessage: next.errorMessage,
            status: res.status,
          };
        }
        url = next.url;
        continue;
      }

      // 401: hard login wall — do not scrape around it.
      if (res.status === 401) {
        return {
          ok: false,
          errorCode: "login_required",
          errorMessage:
            "此房源頁面需要登入才能閱讀（不是要你登入本 App）。請改貼文字內容或上傳截圖。",
          status: res.status,
        };
      }

      const contentType = res.headers.get("content-type");
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.byteLength > maxBytes) {
        return {
          ok: false,
          errorCode: "body_too_large",
          errorMessage: "頁面內容過大，請改貼重點文字或上傳截圖。",
          status: res.status,
        };
      }

      const bodyText = new TextDecoder("utf-8", { fatal: false }).decode(buf);

      // 403: soft walls sometimes still return HTML — try extract if body is usable.
      if (res.status === 403) {
        if (bodyText.trim().length >= MIN_FORBIDDEN_BODY_CHARS) {
          return {
            ok: true,
            finalUrl: url.toString(),
            contentType,
            bodyText,
            status: res.status,
          };
        }
        return {
          ok: false,
          errorCode: "login_required",
          errorMessage:
            "此房源頁面不開放直接讀取（可能需登入或防機器人；不是要你登入本 App）。請改貼文字或上傳截圖。",
          status: res.status,
        };
      }

      if (!res.ok) {
        return {
          ok: false,
          errorCode: "fetch_failed",
          errorMessage: `無法開啟此連結（HTTP ${res.status}）。可改貼文字或上傳截圖。`,
          status: res.status,
        };
      }

      if (!bodyText.trim()) {
        return {
          ok: false,
          errorCode: "empty_or_dynamic",
          errorMessage:
            "無法擷取頁面文字（可能是動態載入）。請貼上房源文字或上傳截圖。",
          status: res.status,
        };
      }

      return {
        ok: true,
        finalUrl: url.toString(),
        contentType,
        bodyText,
        status: res.status,
      };
    } catch (err) {
      const aborted =
        err instanceof Error &&
        (err.name === "AbortError" || /aborted/i.test(err.message));
      return {
        ok: false,
        errorCode: aborted ? "timeout" : "fetch_failed",
        errorMessage: aborted
          ? "開啟連結逾時，請稍後再試或改貼文字／截圖。"
          : "無法開啟此連結，請確認網址或改貼文字／截圖。",
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    ok: false,
    errorCode: "too_many_redirects",
    errorMessage: "重新導向次數過多，已停止擷取。",
  };
}
