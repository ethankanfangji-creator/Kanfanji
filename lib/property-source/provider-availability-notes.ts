/**
 * Human-readable provider availability notes for enrich / reports.
 * Never includes env key names or secrets.
 */

import { getProviderDefs } from "@/lib/property-facts/providers/registry";
import type { ProviderSkipReason } from "@/lib/property-facts/providers/types";
import type { PropertyRegion } from "@/lib/property-facts/types";

export type ProviderAvailabilitySummary = {
  id: string;
  label: string;
  available: boolean;
  reason?: ProviderSkipReason;
};

const SKIP_REASON_ZH: Record<ProviderSkipReason, string> = {
  missing_key: "未設定金鑰",
  disabled: "預設關閉",
  out_of_region: "不適用此地區",
  stub_only: "需授權／尚未接上",
  scraping_forbidden: "禁止爬取",
  invalid_config: "設定無效",
};

export function formatSkipReasonZh(reason: ProviderSkipReason): string {
  return SKIP_REASON_ZH[reason] ?? reason;
}

export function buildProviderAvailabilityNotes(input: {
  used?: Array<{ id: string }>;
  skipped?: Array<{ id: string; reason: string }>;
  region?: PropertyRegion;
}): { notes: string[]; availability: ProviderAvailabilitySummary[] } {
  const notes: string[] = [];
  const usedIds = new Set((input.used ?? []).map((u) => u.id));
  const skippedMap = new Map(
    (input.skipped ?? []).map((s) => [s.id, s.reason as ProviderSkipReason]),
  );

  const availability: ProviderAvailabilitySummary[] = [];
  for (const def of getProviderDefs()) {
    if (input.region && def.regions.length && !def.regions.includes(input.region)) {
      continue;
    }
    if (usedIds.has(def.id)) {
      availability.push({
        id: def.id,
        label: def.label,
        available: true,
      });
      continue;
    }
    const reason = skippedMap.get(def.id);
    if (reason) {
      availability.push({
        id: def.id,
        label: def.label,
        available: false,
        reason,
      });
      notes.push(`${def.label}：${formatSkipReasonZh(reason)}`);
    }
  }

  if (usedIds.size > 0) {
    notes.unshift(
      `已嘗試外部資料：${[...usedIds].join(", ")}（仍需人工驗證）。`,
    );
  } else if (skippedMap.size > 0) {
    notes.unshift("外部資料提供者此次未回傳可用結果（請見略過原因）。");
  } else {
    notes.unshift("外部資料提供者未回傳可用結果（資料尚未連接或查無）。");
  }

  return { notes, availability };
}
