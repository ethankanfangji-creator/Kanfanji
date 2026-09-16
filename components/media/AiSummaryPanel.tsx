"use client";

import { AlertTriangle } from "lucide-react";
import type { AiClaimItem, ConfidenceLevel, ViewingAiSummary } from "@/lib/ai-summary";
import { activeClaims } from "@/lib/ai-summary";

type SectionKey = "facts" | "pros" | "risks" | "followUps" | "actionItems";

export function AiSummaryPanel({
  summary,
  labels,
  onEdit,
  onDelete,
}: {
  summary: ViewingAiSummary;
  labels: {
    title: string;
    facts: string;
    pros: string;
    risks: string;
    followUps: string;
    actionItems: string;
    riskDisclaimer: string;
    confidence: Record<ConfidenceLevel, string>;
    source: string;
    edit: string;
    delete: string;
    empty: string;
  };
  onEdit: (section: SectionKey, id: string, text: string) => void;
  onDelete: (section: SectionKey, id: string) => void;
}) {
  const sections: Array<{ key: SectionKey; title: string; items: AiClaimItem[] }> = [
    { key: "facts", title: labels.facts, items: summary.facts },
    { key: "pros", title: labels.pros, items: summary.pros },
    { key: "risks", title: labels.risks, items: summary.risks },
    { key: "followUps", title: labels.followUps, items: summary.followUps },
    { key: "actionItems", title: labels.actionItems, items: summary.actionItems },
  ];

  return (
    <section
      className="mt-4 rounded-2xl border border-[#DBEAFE] bg-[#F8FAFF] p-4"
      aria-label={labels.title}
    >
      <h3 className="text-[12px] font-[800] tracking-widest text-[#1D4ED8]">{labels.title}</h3>

      <div
        className="mt-3 rounded-xl border border-[#FDE68A] bg-[#FFFBEB] p-3 text-[12px] text-[#92400E] leading-[1.45] flex gap-2"
        role="note"
      >
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
        <p>{labels.riskDisclaimer}</p>
      </div>

      <div className="mt-3 space-y-4">
        {sections.map((section) => {
          const items = activeClaims(section.items);
          return (
            <div key={section.key}>
              <h4 className="text-[12px] font-bold text-[#374151]">{section.title}</h4>
              {items.length === 0 ? (
                <p className="mt-1.5 text-[12px] text-[#9CA3AF]">{labels.empty}</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {items.map((item) => (
                    <li
                      key={item.id}
                      className="rounded-xl bg-white border border-black/5 p-3"
                    >
                      <label className="block">
                        <span className="sr-only">{labels.edit}</span>
                        <textarea
                          value={item.text}
                          onChange={(event) =>
                            onEdit(section.key, item.id, event.target.value)
                          }
                          rows={2}
                          className="w-full text-[13px] leading-[1.4] outline-none resize-none bg-transparent"
                        />
                      </label>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]">
                        <span
                          className={`px-2 py-1 rounded-full font-bold ${
                            item.confidence === "needs_verification"
                              ? "bg-[#FEF3C7] text-[#92400E]"
                              : item.confidence === "high"
                                ? "bg-[#DCFCE7] text-[#166534]"
                                : "bg-[#E5E7EB] text-[#374151]"
                          }`}
                        >
                          {labels.confidence[item.confidence]}
                        </span>
                        {item.sources.length > 0 ? (
                          <span className="text-[#6B7280]">
                            {labels.source}:{" "}
                            {item.sources
                              .map((source) => {
                                const bits: string[] = [source.kind];
                                if (source.timestampSec != null) {
                                  bits.push(`${source.timestampSec}s`);
                                }
                                if (source.noteId != null) bits.push(`note:${source.noteId}`);
                                if (source.mediaId) bits.push(`media:${source.mediaId.slice(0, 8)}`);
                                return bits.join(" ");
                              })
                              .join(" · ")}
                          </span>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => onDelete(section.key, item.id)}
                          className="ml-auto min-h-10 px-3 rounded-full bg-[#FEF2F2] text-[#991B1B] font-bold"
                        >
                          {labels.delete}
                        </button>
                      </div>
                      {item.sources.some((s) => s.quote) ? (
                        <p className="mt-2 text-[11px] text-[#6B7280] italic leading-[1.35]">
                          “{item.sources.find((s) => s.quote)?.quote}”
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
