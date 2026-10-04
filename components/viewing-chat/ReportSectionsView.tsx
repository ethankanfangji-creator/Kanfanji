"use client";

import { ReportMarkdown } from "@/components/viewing-chat/ReportMarkdown";
import { formatStars, hasSectionedReport } from "@/lib/viewing-chat/report-sections";
import type { ChatReportMeta, ChatReportSnapshot } from "@/lib/viewing-chat/types";

export type ReportSectionLabels = {
  overview: string;
  interior: string;
  outdoorLand: string;
  transitLifestyle: string;
  pricing: string;
  pros: string;
  risks: string;
  scores: string;
  highlight: string;
  biggestQuestion: string;
  overall: string;
  verdict: string;
  nextSteps: string;
  meta: {
    viewingDate: string;
    propertyType: string;
    yearBuilt: string;
    askingPrice: string;
    lotSize: string;
    interiorSize: string;
    layout: string;
    neighborhood: string;
  };
};

const META_ORDER: Array<keyof ChatReportMeta> = [
  "viewingDate",
  "propertyType",
  "yearBuilt",
  "askingPrice",
  "lotSize",
  "interiorSize",
  "layout",
  "neighborhood",
];

/** Renders ChatGPT-template sections, or falls back to assembled/legacy summary markdown. */
export function ReportSectionsView({
  report,
  labels,
  className = "",
}: {
  report: Pick<
    ChatReportSnapshot,
    | "title"
    | "meta"
    | "overview"
    | "interior"
    | "outdoorLand"
    | "transitLifestyle"
    | "pricing"
    | "pros"
    | "risks"
    | "scores"
    | "verdict"
    | "nextSteps"
    | "summary"
  >;
  labels: ReportSectionLabels;
  className?: string;
}) {
  if (!hasSectionedReport(report)) {
    return report.summary ? (
      <ReportMarkdown text={report.summary} className={className} />
    ) : null;
  }

  const metaRows = META_ORDER.map((key) => {
    const value = report.meta?.[key]?.trim();
    if (!value) return null;
    return { key, label: labels.meta[key], value };
  }).filter(Boolean) as Array<{ key: keyof ChatReportMeta; label: string; value: string }>;

  const scores = report.scores;
  const showScores = Boolean(
    scores &&
      (scores.items.length || scores.overall || scores.highlight || scores.biggestQuestion),
  );

  return (
    <div className={`space-y-4 ${className}`}>
      {report.title?.trim() ? (
        <h2 className="text-[17px] font-bold leading-snug">{report.title.trim()}</h2>
      ) : null}
      {metaRows.length ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
          {metaRows.map((row) => (
            <div key={row.key} className="contents">
              <dt className="font-semibold text-[#6B7280]">{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {/* Markdown sections: AI-written ## headings only — no fixed UI titles. */}
      <MarkdownBlock markdown={report.overview} />
      <MarkdownBlock markdown={report.interior} />
      <MarkdownBlock markdown={report.outdoorLand} />
      <MarkdownBlock markdown={report.transitLifestyle} />
      <MarkdownBlock markdown={report.pricing} />
      <BulletSection title={labels.pros} items={report.pros} tone="pros" />
      <BulletSection title={labels.risks} items={report.risks} tone="risks" />
      {showScores && scores ? (
        <div>
          <p className="mb-1 text-[12px] font-bold text-[#374151]">{labels.scores}</p>
          {scores.items.length ? (
            <ul className="space-y-1 text-[13px]">
              {scores.items.map((item) => (
                <li key={item.label} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="min-w-[4.5rem] font-medium text-[#374151]">{item.label}</span>
                  <span className="tracking-wide text-[#B45309]" aria-label={`${item.score} / 5`}>
                    {formatStars(item.score)}
                  </span>
                  <span className="text-[11px] text-[#6B7280]">{item.score}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {scores.overall?.trim() ? (
            <p className="mt-2 text-[13px]">
              <span className="font-semibold">{labels.overall}：</span>
              {scores.overall.trim()}
            </p>
          ) : null}
          {scores.highlight?.trim() ? (
            <p className="mt-1 text-[13px]">
              <span className="font-semibold">{labels.highlight}：</span>
              {scores.highlight.trim()}
            </p>
          ) : null}
          {scores.biggestQuestion?.trim() ? (
            <p className="mt-1 text-[13px]">
              <span className="font-semibold">{labels.biggestQuestion}：</span>
              {scores.biggestQuestion.trim()}
            </p>
          ) : null}
        </div>
      ) : null}
      <MarkdownBlock markdown={report.verdict} />
      <BulletSection title={labels.nextSteps} items={report.nextSteps} tone="next" />
    </div>
  );
}

function MarkdownBlock({ markdown }: { markdown?: string }) {
  if (!markdown?.trim()) return null;
  return <ReportMarkdown text={markdown} />;
}

function BulletSection({
  title,
  items,
  tone,
}: {
  title: string;
  items?: string[];
  tone: "pros" | "risks" | "next";
}) {
  if (!items?.length) return null;
  const color =
    tone === "pros"
      ? "text-[#166534]"
      : tone === "risks"
        ? "text-[#991B1B]"
        : "text-[#1D4ED8]";
  return (
    <div>
      <p className={`text-[12px] font-bold ${color}`}>{title}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px] leading-snug">
        {items.map((item) => (
          <li key={item.slice(0, 64)}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
