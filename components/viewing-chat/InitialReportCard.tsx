"use client";

import type { InitialPropertyReport } from "@/lib/property-source/initial-report-schema";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { RiskPriorityCard } from "./RiskPriorityCard";
import { QuestionsToAskList } from "./QuestionsToAskList";
import { ViewingChecklist } from "./ViewingChecklist";
import { NextActionSelector } from "./NextActionSelector";

export function InitialReportCard({
  report,
  onAction,
  labels,
}: {
  report: InitialPropertyReport;
  onAction?: (actionId: string, prompt: string) => void;
  labels: {
    title: string;
    completeness: string;
    disclaimer: string;
  };
}) {
  return (
    <div className="space-y-3 text-[13px] leading-relaxed">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-bold text-[15px]">{labels.title}</p>
        <span className="rounded-full bg-[#FEF3C7] px-2 py-0.5 text-[11px] font-bold text-[#92400E]">
          {report.reportStatus}
        </span>
        <ConfidenceBadge score={report.dataCompleteness.score} />
      </div>
      <p className="text-[12px] text-[#6B7280]">
        {labels.completeness}: {(report.dataCompleteness.score * 100).toFixed(0)}%
        {report.dataCompleteness.missingFields.length
          ? ` · missing ${report.dataCompleteness.missingFields.slice(0, 4).join(", ")}`
          : ""}
      </p>
      {report.sections.map((section) => (
        <div key={section.id} className="rounded-xl bg-[#F9FAFB] px-3 py-2">
          <p className="text-[12px] font-bold text-[#1F2937]">{section.title}</p>
          <p className="mt-1 whitespace-pre-wrap text-[12px] text-[#374151]">{section.body}</p>
        </div>
      ))}
      <RiskPriorityCard risks={report.risks} />
      <QuestionsToAskList questions={report.questionsToAsk} />
      <ViewingChecklist items={report.viewingChecklist} />
      <NextActionSelector
        actions={report.nextActions}
        onSelect={(action) => onAction?.(action.id, action.label)}
      />
      <p className="text-[11px] text-[#6B7280]">
        {labels.disclaimer}: {report.disclaimer}
      </p>
      {report.sources.length ? (
        <details className="text-[11px] text-[#6B7280]">
          <summary className="cursor-pointer font-semibold">Sources</summary>
          <ul className="mt-1 list-disc pl-4">
            {report.sources.map((s) => (
              <li key={s.sourceId}>
                {s.label}
                {s.url ? ` — ${s.url}` : ""}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
