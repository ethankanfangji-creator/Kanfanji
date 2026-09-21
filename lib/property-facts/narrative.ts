/**
 * Deterministic Traditional Chinese narrative from PropertyReport.
 * Only cites existing evidence — never invents numeric or listing facts.
 * Fixed 12-section catalog (see REPORT_SECTION_CATALOG).
 */

import type {
  PropertyReport,
  ReportEvidenceItem,
  ReportNarrative,
  ReportNarrativeSection,
  ReportSourceSnippet,
  SourceSnippetLanguage,
} from "./report-types";
import {
  PROPERTY_REPORT_DISCLAIMER_ZH,
  REPORT_SECTION_CATALOG,
} from "./report-types";

const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff]/;
const LATIN_RE = /[A-Za-zÀ-ÿ]/;
/** Common French markers (accents + frequent words). */
const FR_HINT_RE =
  /\b(le|la|les|des|une|est|pour|avec|dans|sur|rue|avenue|municipalité|impôt|copropriété)\b|[àâäéèêëïîôùûüçœæ]/i;

export function detectSnippetLanguage(text: string): SourceSnippetLanguage {
  const trimmed = text.trim();
  if (!trimmed) return "other";
  if (CJK_RE.test(trimmed) && !LATIN_RE.test(trimmed.replace(/\s/g, "").slice(0, 40))) {
    return "zh";
  }
  if (CJK_RE.test(trimmed) && LATIN_RE.test(trimmed)) {
    const cjk = (trimmed.match(/[\u3400-\u9fff]/g) ?? []).length;
    if (cjk >= 4) return "zh";
  }
  if (FR_HINT_RE.test(trimmed)) return "fr";
  if (LATIN_RE.test(trimmed)) return "en";
  return "other";
}

function evidenceById(
  report: Omit<PropertyReport, "narrative"> | PropertyReport,
): Map<string, ReportEvidenceItem> {
  return new Map(report.evidence.map((e) => [e.id, e]));
}

function formatClaim(
  label: string,
  value: string | number | null | undefined,
  evidenceId: string | null | undefined,
  ids: string[],
): string | null {
  if (value == null || value === "") return null;
  if (evidenceId) ids.push(evidenceId);
  const cite = evidenceId ? `〔${evidenceId}〕` : "";
  return `${label}：${value}${cite}`;
}

function formatLocationLine(
  items: PropertyReport["location"]["schools"],
  ids: string[],
  limit = 3,
): string | null {
  if (!items.length) return null;
  const parts = items.slice(0, limit).map((item) => {
    if (item.evidence_id) ids.push(item.evidence_id);
    const walk =
      item.walking_minutes != null ? `，步行約 ${item.walking_minutes} 分鐘` : "";
    const drive =
      item.driving_minutes != null ? `，駕車約 ${item.driving_minutes} 分鐘` : "";
    const cite = item.evidence_id ? `〔${item.evidence_id}〕` : "";
    return `${item.name}${walk}${drive}${cite}`;
  });
  return parts.join("；");
}

function collectSourceSnippets(
  report: Omit<PropertyReport, "narrative"> | PropertyReport,
): ReportSourceSnippet[] {
  const out: ReportSourceSnippet[] = [];
  for (const ev of report.evidence) {
    const raw =
      (typeof ev.evidence === "string" && ev.evidence.trim()) ||
      (typeof ev.value === "string" && ev.value.trim()) ||
      null;
    if (!raw) continue;
    if (raw.length < 8 && !/[A-Za-zÀ-ÿ\u3400-\u9fff]/.test(raw)) continue;
    out.push({
      evidence_id: ev.id,
      original_text: raw.slice(0, 500),
      language: detectSnippetLanguage(raw),
    });
    if (out.length >= 20) break;
  }
  return out;
}

function sectionTitle(id: (typeof REPORT_SECTION_CATALOG)[number]["id"]): string {
  return REPORT_SECTION_CATALOG.find((s) => s.id === id)!.title;
}

function fieldEvidence(
  report: Omit<PropertyReport, "narrative"> | PropertyReport,
  field: string,
): ReportEvidenceItem | undefined {
  return report.evidence.find((e) => e.field === field && e.status === "found");
}

/**
 * Build zh-Hant narrative. Template-only — values come from report fields/evidence.
 * Always emits all 12 catalog sections (empty sections state the gap honestly).
 */
export function buildReportNarrative(
  report: Omit<PropertyReport, "narrative"> | PropertyReport,
): ReportNarrative {
  const sections: ReportNarrativeSection[] = [];
  const summaryBits: string[] = [];

  // 1. address
  {
    const ids: string[] = [];
    const match = report.request.match;
    const lines: string[] = [
      `輸入地址：${report.request.input_address}`,
      `標準化地址：${report.request.normalized_address}`,
      `國家／地區：${report.request.country}`,
    ];
    if (report.request.jurisdiction_key) {
      lines.push(`管轄鍵：${report.request.jurisdiction_key}`);
    }
    if (match) {
      lines.push(`地址匹配等級：${match.level}`);
      if (match.parcel_id) lines.push(`地籍／parcel：${match.parcel_id}`);
      if (match.unit_id) lines.push(`單元：${match.unit_id}`);
      if (match.notes.length) {
        lines.push(`匹配備註：${match.notes.slice(0, 5).join("；")}`);
      }
    }
    const lat = report.request.coordinates.lat;
    const lng = report.request.coordinates.lng;
    if (lat != null && lng != null) {
      lines.push(`座標：${lat}, ${lng}`);
    } else {
      lines.push("座標：尚未取得（見查證清單）");
    }
    for (const field of ["normalized_address", "display_address", "place_id", "lat", "lng"]) {
      const ev = report.evidence.find((e) => e.field === field);
      if (ev) ids.push(ev.id);
    }
    sections.push({
      id: "address",
      title: sectionTitle("address"),
      body: lines.join("\n"),
      evidence_ids: unique(ids),
    });
    summaryBits.push(
      `${report.request.normalized_address}（${report.request.country}${
        match ? `，匹配 ${match.level}` : ""
      }）`,
    );
  }

  // 2. property
  {
    const ids: string[] = [];
    const lines: string[] = [];
    const p = report.property;
    const push = (label: string, value: string | number | null, field: string) => {
      const ev = fieldEvidence(report, field);
      const line = formatClaim(label, value, ev?.id ?? null, ids);
      if (line) lines.push(line);
    };
    push("物件類型", p.property_type, "property_type");
    push("屋齡／建造年", p.year_built, "year_built");
    push("建物面積", p.building_area, "building_area");
    push("土地面積", p.lot_area, "lot_area");
    push("房", p.bedrooms, "bedrooms");
    push("衛", p.bathrooms, "bathrooms");
    if (!lines.length) {
      lines.push("目前沒有足夠的建物／房源確認資料，請見查證清單。");
    }
    sections.push({
      id: "property",
      title: sectionTitle("property"),
      body: lines.join("\n"),
      evidence_ids: unique(ids),
    });
    if (p.year_built != null) summaryBits.push(`建造年 ${p.year_built}`);
    if (p.bedrooms != null) summaryBits.push(`${p.bedrooms} 房`);
  }

  // 3. condition
  {
    const ids: string[] = [];
    const lines: string[] = [];
    const cond = report.property.condition;
    if (cond.value) {
      const ev = fieldEvidence(report, "condition");
      const line = formatClaim("屋況／翻修描述", cond.value, ev?.id ?? null, ids);
      if (line) lines.push(line);
      if (cond.basis) {
        lines.push(
          `依據：${cond.basis === "official_record" ? "官方紀錄" : cond.basis === "listing" ? "房源描述" : "其他來源"}`,
        );
      }
    }
    const permitEv = report.evidence.find((e) => e.field === "permit_or_violation");
    if (report.risks.permit_or_violation) {
      const line = formatClaim(
        "建照／違規相關",
        report.risks.permit_or_violation,
        permitEv?.id ?? null,
        ids,
      );
      if (line) lines.push(line);
    }
    if (!lines.length) {
      lines.push(
        "目前沒有可引用的屋況或翻修證據（系統不依照片或描述推測結構／裝修狀態）。",
      );
    }
    sections.push({
      id: "condition",
      title: sectionTitle("condition"),
      body: lines.join("\n"),
      evidence_ids: unique(ids),
    });
  }

  // 4. costs (price + tax + fees)
  {
    const ids: string[] = [];
    const lines: string[] = [];
    const feeLabel =
      report.request.adapter?.fee_label_zh ||
      report.request.adapter?.fee_label ||
      "HOA／管理費／Strata";
    const costLines: { key: keyof PropertyReport["costs"]; label: string }[] = [
      { key: "listing_price", label: "掛牌價／售價" },
      { key: "property_tax", label: "財產稅／地價稅相關" },
      { key: "hoa_or_management_fee", label: feeLabel },
      { key: "special_assessment", label: "特別攤派" },
      { key: "insurance_estimate", label: "保險估算" },
    ];
    for (const { key, label } of costLines) {
      const c = report.costs[key];
      if (c.status === "not_found") continue;
      if (c.evidence_id) ids.push(c.evidence_id);
      if (c.status === "needs_human" || c.status === "conflict") {
        const tag = c.status === "conflict" ? "來源衝突" : "需人工確認";
        lines.push(
          `${label}：${c.value ?? "（有來源但未確認）"}〔${tag}${
            c.evidence_id ? `，${c.evidence_id}` : ""
          }〕`,
        );
      } else {
        lines.push(`${label}：${c.value}${c.evidence_id ? `〔${c.evidence_id}〕` : ""}`);
      }
    }
    const rentEv = fieldEvidence(report, "estimated_rent_range");
    const rentLine = formatClaim(
      "租金參考",
      report.market.estimated_rent_range,
      rentEv?.id ?? null,
      ids,
    );
    if (rentLine) lines.push(rentLine);
    if (!lines.length) {
      lines.push("售價、租金與稅費相關欄位目前無確認資料。");
    }
    sections.push({
      id: "costs",
      title: sectionTitle("costs"),
      body: lines.join("\n"),
      evidence_ids: unique(ids),
    });
  }

  // 5. market
  {
    const ids: string[] = [];
    const lines: string[] = [];
    const m = report.market;
    const add = (label: string, value: string | null, field: string) => {
      const ev = report.evidence.find((e) => e.field === field);
      const line = formatClaim(label, value, ev?.id ?? null, ids);
      if (line) lines.push(line);
    };
    add("幣別", m.currency, "currency");
    add("估價／價格區間", m.estimated_price_range, "estimated_price_range");
    add("最近成交", m.last_sold, "last_sold");
    if (m.recent_comparables.length === 0) {
      lines.push("同類成交比較：尚未取得可引用個案。");
    }
    if (
      !m.currency &&
      !m.estimated_price_range &&
      !m.last_sold
    ) {
      // only the comparables gap line — keep a clear insufficiency note first
      lines.unshift("市場成交與估價資料不足。");
    }
    sections.push({
      id: "market",
      title: sectionTitle("market"),
      body: lines.join("\n"),
      evidence_ids: unique(ids),
    });
  }

  // 6. amenities
  {
    const ids: string[] = [];
    const lines: string[] = [];
    const schoolLine = formatLocationLine(report.location.schools, ids);
    if (schoolLine) lines.push(`學校：${schoolLine}`);
    const shopLine = formatLocationLine(report.location.shopping, ids);
    if (shopLine) lines.push(`購物：${shopLine}`);
    const diningLine = formatLocationLine(report.location.dining, ids);
    if (diningLine) lines.push(`餐飲：${diningLine}`);
    const medLine = formatLocationLine(report.location.medical, ids);
    if (medLine) lines.push(`醫療：${medLine}`);
    const parkLine = formatLocationLine(report.location.parks, ids);
    if (parkLine) lines.push(`公園：${parkLine}`);
    if (!lines.length) lines.push("生活機能（學校／購物／餐飲／醫療／公園）尚未取得可引用資料。");
    sections.push({
      id: "amenities",
      title: sectionTitle("amenities"),
      body: lines.join("\n"),
      evidence_ids: unique(ids),
    });
  }

  // 7. transit
  {
    const ids: string[] = [];
    const lines: string[] = [];
    const transitLine = formatLocationLine(report.location.transit, ids);
    if (transitLine) lines.push(`大眾運輸／站點：${transitLine}`);
    else lines.push("交通站點距離尚未取得可引用資料。");
    sections.push({
      id: "transit",
      title: sectionTitle("transit"),
      body: lines.join("\n"),
      evidence_ids: unique(ids),
    });
  }

  // 8. zoning
  {
    const ids: string[] = [];
    const lines: string[] = [];
    const zoningEv = report.evidence.find((e) => e.field === "zoning");
    if (report.risks.zoning) {
      const line = formatClaim("分區", report.risks.zoning, zoningEv?.id ?? null, ids);
      if (line) lines.push(line);
    }
    const permitEv = report.evidence.find((e) => e.field === "permit_or_violation");
    if (report.risks.permit_or_violation) {
      const line = formatClaim(
        "建照／違規",
        report.risks.permit_or_violation,
        permitEv?.id ?? null,
        ids,
      );
      if (line) lines.push(line);
    }
    if (report.request.adapter?.legal_notices?.length) {
      lines.push(
        `管轄法律備註：${report.request.adapter.legal_notices.slice(0, 3).join("；")}`,
      );
    }
    if (!lines.length) {
      lines.push("分區、建照與使用限制資料不足，系統未做推測。");
    }
    sections.push({
      id: "zoning",
      title: sectionTitle("zoning"),
      body: lines.join("\n"),
      evidence_ids: unique(ids),
    });
  }

  // 9. risks (hazards only — zoning split out)
  {
    const ids: string[] = [];
    const lines: string[] = [];
    const r = report.risks;
    const addRisk = (label: string, value: string | null, field: string) => {
      if (!value) return;
      const ev = report.evidence.find((e) => e.field === field);
      const line = formatClaim(label, value, ev?.id ?? null, ids);
      if (line) lines.push(line);
    };
    addRisk("洪水", r.flood, "flood");
    addRisk("地震", r.earthquake, "earthquake");
    addRisk("野火", r.wildfire, "wildfire");
    addRisk("噪音", r.noise, "noise");
    if (!lines.length) {
      lines.push("災害與環境風險資料不足，系統未做推測。");
    }
    sections.push({
      id: "risks",
      title: sectionTitle("risks"),
      body: lines.join("\n"),
      evidence_ids: unique(ids),
    });
  }

  // 10. confidence
  {
    const ids: string[] = [];
    const lines: string[] = [];
    const found = report.evidence.filter((e) => e.status === "found").length;
    const needsHuman = report.evidence.filter((e) => e.status === "needs_human").length;
    const conflicts = report.evidence.filter((e) => e.status === "conflict").length;
    const estimateLike = report.evidence.filter(
      (e) => e.source_type === "model_estimate" || e.source_type === "area_statistic",
    ).length;
    lines.push(`已確認證據筆數：${found}`);
    lines.push(`需人工確認：${needsHuman}`);
    lines.push(`來源衝突：${conflicts}`);
    lines.push(`估算／區域統計類來源：${estimateLike}`);
    if (report.request.match) {
      lines.push(`地址匹配等級：${report.request.match.level}（影響後續欄位可信度）`);
    }
    const official = report.evidence.filter(
      (e) =>
        (e.source_type === "official" || e.source_type === "public_record") &&
        e.status === "found",
    ).length;
    const licensed = report.evidence.filter(
      (e) =>
        (e.source_type === "licensed_vendor" || e.source_type === "licensed_listing") &&
        e.status === "found",
    ).length;
    lines.push(`官方／公共紀錄確認：${official}；持照資料源確認：${licensed}`);
    if (conflicts > 0) {
      for (const ev of report.evidence.filter((e) => e.status === "conflict").slice(0, 5)) {
        ids.push(ev.id);
        lines.push(`衝突欄位：${ev.field}〔${ev.id}〕`);
      }
    }
    sections.push({
      id: "confidence",
      title: sectionTitle("confidence"),
      body: lines.join("\n"),
      evidence_ids: unique(ids),
    });
  }

  // 11. verification checklist
  {
    const lines: string[] = [];
    const checklist = report.compliance?.human_verification?.checklist ?? [];
    if (checklist.length) {
      lines.push("建議人工查證（依合規清單）：");
      for (const item of checklist.slice(0, 30)) {
        lines.push(`・${item.label_zh}`);
      }
    }
    const gaps = report.risks.data_gaps;
    if (gaps.length) {
      if (lines.length) lines.push("");
      lines.push("資料缺口（系統未猜測）：");
      for (const g of gaps.slice(0, 40)) {
        lines.push(`・${g}`);
      }
      if (gaps.length > 40) lines.push(`…另有 ${gaps.length - 40} 項`);
    }
    if (report.compliance?.notices?.length) {
      if (lines.length) lines.push("");
      lines.push("合規備註：");
      for (const n of report.compliance.notices.slice(0, 12)) {
        lines.push(`・${n}`);
      }
    }
    if (!lines.length) {
      lines.push("目前未標記額外人工查證項目；請仍以官方／持照來源覆核關鍵交易條件。");
    }
    sections.push({
      id: "verification",
      title: sectionTitle("verification"),
      body: lines.join("\n"),
      evidence_ids: [],
    });
  }

  // 12. disclaimer
  sections.push({
    id: "disclaimer",
    title: sectionTitle("disclaimer"),
    body: PROPERTY_REPORT_DISCLAIMER_ZH,
    evidence_ids: [],
  });

  // Ensure catalog order and completeness
  const byId = new Map(sections.map((s) => [s.id, s]));
  const ordered: ReportNarrativeSection[] = REPORT_SECTION_CATALOG.map((meta) => {
    const existing = byId.get(meta.id);
    if (existing) return { ...existing, title: meta.title };
    return {
      id: meta.id,
      title: meta.title,
      body: "（本節無內容）",
      evidence_ids: [],
    };
  });

  const summary_zh =
    summaryBits.length > 0
      ? `看房摘要：${summaryBits.join("；")}。詳細來源見各節證據編號；缺口見「未確認事項與建議的人工查證清單」。`
      : "看房摘要：目前僅完成地址處理，尚無足夠確認事實可彙整。";

  const known = evidenceById(report);
  for (const section of ordered) {
    section.evidence_ids = section.evidence_ids.filter((id) => known.has(id));
  }

  return {
    locale: "zh-Hant",
    summary_zh,
    sections_zh: ordered,
    source_snippets: collectSourceSnippets(report),
    disclaimer_zh: PROPERTY_REPORT_DISCLAIMER_ZH,
  };
}

function unique(ids: string[]): string[] {
  return [...new Set(ids)];
}
