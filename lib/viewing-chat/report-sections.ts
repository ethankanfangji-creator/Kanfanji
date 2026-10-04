import type {
  ChatReportMeta,
  ChatReportScores,
  ChatReportSnapshot,
} from "@/lib/viewing-chat/types";

const META_KEYS: Array<keyof ChatReportMeta> = [
  "viewingDate",
  "propertyType",
  "yearBuilt",
  "askingPrice",
  "lotSize",
  "interiorSize",
  "layout",
  "neighborhood",
];

export function normalizeReportMeta(raw: unknown): ChatReportMeta | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const row = raw as Record<string, unknown>;
  const meta: ChatReportMeta = {};
  let any = false;
  for (const key of META_KEYS) {
    const value = row[key];
    if (value == null) {
      meta[key] = null;
      continue;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      meta[key] = trimmed || null;
      if (trimmed) any = true;
    }
  }
  return any ? meta : undefined;
}

/** Clamp score to 0–5 in 0.5 steps. */
export function normalizeScoreValue(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  const clamped = Math.min(5, Math.max(0, n));
  return Math.round(clamped * 2) / 2;
}

export function normalizeReportScores(raw: unknown): ChatReportScores | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const row = raw as Record<string, unknown>;
  const itemsRaw = Array.isArray(row.items) ? row.items : [];
  const items: ChatReportScores["items"] = [];
  for (const item of itemsRaw.slice(0, 16)) {
    if (!item || typeof item !== "object") continue;
    const label = String((item as { label?: unknown }).label ?? "").trim();
    const score = normalizeScoreValue((item as { score?: unknown }).score);
    if (!label || score == null) continue;
    items.push({ label: label.slice(0, 80), score });
  }
  const overall =
    typeof row.overall === "string" && row.overall.trim() ? row.overall.trim().slice(0, 80) : undefined;
  const highlight =
    typeof row.highlight === "string" && row.highlight.trim()
      ? row.highlight.trim().slice(0, 500)
      : undefined;
  const biggestQuestion =
    typeof row.biggestQuestion === "string" && row.biggestQuestion.trim()
      ? row.biggestQuestion.trim().slice(0, 500)
      : undefined;
  if (!items.length && !overall && !highlight && !biggestQuestion) return undefined;
  return { items, overall, highlight, biggestQuestion };
}

export function formatStars(score: number): string {
  const full = Math.floor(score);
  const half = score - full >= 0.5;
  return `${"★".repeat(full)}${half ? "½" : ""}${"☆".repeat(Math.max(0, 5 - full - (half ? 1 : 0)))}`;
}

export function hasSectionedReport(
  report: Pick<
    ChatReportSnapshot,
    | "title"
    | "overview"
    | "interior"
    | "outdoorLand"
    | "transitLifestyle"
    | "pricing"
    | "verdict"
    | "scores"
    | "nextSteps"
    | "meta"
  > | null | undefined,
): boolean {
  if (!report) return false;
  if (report.title?.trim()) return true;
  if (report.meta && Object.values(report.meta).some((v) => Boolean(v))) return true;
  if (report.overview?.trim()) return true;
  if (report.interior?.trim()) return true;
  if (report.outdoorLand?.trim()) return true;
  if (report.transitLifestyle?.trim()) return true;
  if (report.pricing?.trim()) return true;
  if (report.verdict?.trim()) return true;
  if (report.scores?.items?.length || report.scores?.overall) return true;
  if ((report.nextSteps?.length ?? 0) > 0) return true;
  return false;
}

/** Assemble a single markdown document from ChatGPT-style sections (for share / portfolio). */
export function assembleReportSummary(input: {
  title?: string | null;
  meta?: ChatReportMeta | null;
  overview?: string | null;
  interior?: string | null;
  outdoorLand?: string | null;
  transitLifestyle?: string | null;
  pricing?: string | null;
  pros?: string[];
  risks?: string[];
  scores?: ChatReportScores | null;
  verdict?: string | null;
  nextSteps?: string[];
}): string {
  const parts: string[] = [];
  const title = input.title?.trim();
  if (title) parts.push(`# ${title}`);

  const metaLines: string[] = [];
  const meta = input.meta;
  if (meta) {
    const labels: Array<[keyof ChatReportMeta, string]> = [
      ["viewingDate", "看房日期"],
      ["propertyType", "物業類型"],
      ["yearBuilt", "建成年份"],
      ["askingPrice", "開價"],
      ["lotSize", "土地面積"],
      ["interiorSize", "室內面積"],
      ["layout", "房型"],
      ["neighborhood", "社區"],
    ];
    for (const [key, label] of labels) {
      const value = meta[key]?.trim();
      if (value) metaLines.push(`**${label}：** ${value}`);
    }
  }
  if (metaLines.length) parts.push(metaLines.join("\n"));

  const pushMd = (heading: string, body?: string | null) => {
    const text = body?.trim();
    if (!text) return;
    parts.push(`## ${heading}\n\n${text}`);
  };

  pushMd("物業基本概況", input.overview);
  pushMd("室內觀察", input.interior);
  pushMd("戶外及土地", input.outdoorLand);
  pushMd("交通及生活機能", input.transitLifestyle);
  pushMd("價格與議價", input.pricing);

  if (input.pros?.length) {
    parts.push(`## 優點\n\n${input.pros.map((item) => `- ${item}`).join("\n")}`);
  }
  if (input.risks?.length) {
    parts.push(`## 風險\n\n${input.risks.map((item) => `- ${item}`).join("\n")}`);
  }

  const scores = input.scores;
  if (scores && (scores.items.length || scores.overall || scores.highlight || scores.biggestQuestion)) {
    const lines: string[] = ["## 初步評分"];
    for (const item of scores.items) {
      lines.push(`- **${item.label}**：${formatStars(item.score)} (${item.score})`);
    }
    if (scores.overall?.trim()) lines.push(`\n**整體：** ${scores.overall.trim()}`);
    if (scores.highlight?.trim()) lines.push(`\n**最大亮點：** ${scores.highlight.trim()}`);
    if (scores.biggestQuestion?.trim()) {
      lines.push(`\n**最大疑問：** ${scores.biggestQuestion.trim()}`);
    }
    parts.push(lines.join("\n"));
  }

  pushMd("初步判斷", input.verdict);
  if (input.nextSteps?.length) {
    parts.push(`## 下一步\n\n${input.nextSteps.map((item) => `- ${item}`).join("\n")}`);
  }

  return parts.join("\n\n").trim();
}

/** followUps for legacy share/UI: nextSteps, else biggestQuestion, else old followUps. */
export function reportFollowUpsForLegacy(report: ChatReportSnapshot): string[] {
  if (report.nextSteps?.length) return report.nextSteps;
  const q = report.scores?.biggestQuestion?.trim();
  if (q) return [q];
  return report.followUps ?? [];
}
