/**
 * Traditional Chinese markdown report — fixed TOC from REPORT_SECTION_CATALOG.
 */

import type { DomainPropertyReport } from "./models";
import type { PropertyReport } from "@/lib/property-facts/report-types";
import {
  PROPERTY_REPORT_DISCLAIMER_ZH,
  REPORT_SECTION_CATALOG,
} from "@/lib/property-facts/report-types";
import { extractEvidenceIds } from "@/lib/property-facts/citations";

export type MarkdownReportInput = {
  legacy: PropertyReport;
  domain?: DomainPropertyReport | null;
};

/**
 * Build a zh-Hant markdown document from the structured report.
 * Does not call an LLM and does not invent numeric facts.
 * Section order matches REPORT_SECTION_CATALOG.
 */
export function renderPropertyReportMarkdown(input: MarkdownReportInput): string {
  const { legacy, domain } = input;
  const lines: string[] = [];
  const addr =
    legacy.request.normalized_address || legacy.request.input_address || "（地址未定）";

  lines.push(`# 看房報告`);
  lines.push("");
  lines.push(`**地址：** ${addr}`);
  if (legacy.request.country) {
    lines.push(`**國家／地區：** ${legacy.request.country}`);
  }
  if (legacy.request.jurisdiction_key) {
    lines.push(`**管轄鍵：** \`${legacy.request.jurisdiction_key}\``);
  }
  if (legacy.request.adapter) {
    lines.push(
      `**適配器：** ${legacy.request.adapter.id}（${legacy.request.adapter.units.currency}／${legacy.request.adapter.units.area}）`,
    );
    lines.push(
      `**費用欄位：** ${legacy.request.adapter.fee_label_zh || legacy.request.adapter.fee_label}`,
    );
  }
  lines.push("");

  const summary =
    domain?.narrativeSummaryZh ||
    legacy.narrative?.summary_zh ||
    "看房摘要：資料不足，請見查證清單。";
  lines.push(`## 摘要`);
  lines.push("");
  lines.push(summary);
  lines.push("");

  lines.push(`## 目錄`);
  lines.push("");
  for (const meta of REPORT_SECTION_CATALOG) {
    lines.push(`- [${meta.title}](#${meta.id})`);
  }
  lines.push("");

  const byId = new Map((legacy.narrative?.sections_zh ?? []).map((s) => [s.id, s]));

  for (const meta of REPORT_SECTION_CATALOG) {
    const section = byId.get(meta.id);
    lines.push(`## ${meta.title}`);
    lines.push("");
    if (section?.body) {
      lines.push(section.body);
    } else if (meta.id === "disclaimer") {
      lines.push(legacy.narrative?.disclaimer_zh || PROPERTY_REPORT_DISCLAIMER_ZH);
    } else {
      lines.push("（本節無結構化內容）");
    }

    // Expand amenities / transit with distance detail under those sections
    if (meta.id === "amenities") {
      const extra = formatLocationGroup(legacy, [
        ["學校", legacy.location.schools],
        ["購物", legacy.location.shopping],
        ["餐飲", legacy.location.dining],
        ["醫療", legacy.location.medical],
        ["公園", legacy.location.parks],
      ]);
      if (extra.length) {
        lines.push("");
        lines.push(...extra);
      }
    }
    if (meta.id === "transit") {
      const extra = formatLocationGroup(legacy, [["站點", legacy.location.transit]]);
      if (extra.length) {
        lines.push("");
        lines.push(...extra);
      }
    }

    if (section?.evidence_ids?.length) {
      lines.push("");
      lines.push(`*證據：${section.evidence_ids.map((id) => `\`${id}\``).join("、")}*`);
    }
    lines.push("");
  }

  if (legacy.narrative?.source_snippets?.length) {
    lines.push(`## 原始來源摘錄`);
    lines.push("");
    lines.push("（保留原文，未覆寫翻譯）");
    lines.push("");
    for (const s of legacy.narrative.source_snippets.slice(0, 8)) {
      lines.push(`- \`${s.evidence_id}\` [${s.language}] ${escapeMd(s.original_text)}`);
    }
    lines.push("");
  }

  lines.push(`---`);
  lines.push(`*本文件由系統依證據產生；結論須能對應 evidence id。*`);

  return lines.join("\n");
}

function formatLocationGroup(
  _legacy: PropertyReport,
  groups: [string, PropertyReport["location"]["schools"]][],
): string[] {
  const out: string[] = [];
  for (const [title, items] of groups) {
    if (!items.length) continue;
    out.push(`### ${title}`);
    for (const item of items.slice(0, 5)) {
      const bits: string[] = [item.name];
      if (item.walking_minutes != null) bits.push(`步行約 ${item.walking_minutes} 分`);
      if (item.driving_minutes != null) bits.push(`駕車約 ${item.driving_minutes} 分`);
      if (item.peak_driving_minutes != null) {
        bits.push(`尖峰約 ${item.peak_driving_minutes} 分`);
      }
      if (item.straight_line_meters != null) {
        bits.push(`直線 ${item.straight_line_meters} m`);
      }
      const cite = item.evidence_id ? ` 〔\`${item.evidence_id}\`〕` : "";
      out.push(`- ${bits.join(" · ")}${cite}`);
    }
    out.push("");
  }
  return out;
}

function escapeMd(text: string): string {
  return text.replace(/\n/g, " ").slice(0, 240);
}

/** All evidence ids referenced in markdown must exist on the report. */
export function markdownCitationErrors(
  markdown: string,
  evidenceIds: Iterable<string>,
): string[] {
  const allowed = new Set(evidenceIds);
  const cited = extractEvidenceIds(markdown);
  return cited.filter((id) => !allowed.has(id));
}
