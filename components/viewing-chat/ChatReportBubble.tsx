"use client";

import { useState } from "react";

export function ChatReportBubble({
  summary,
  pros,
  risks,
  checklist,
  generatedAt,
  labels,
  shareLabel,
  onShare,
}: {
  summary?: string;
  pros: string[];
  risks: string[];
  checklist: Array<{ question: string; answer: string; status: "ok" | "risk" | "unknown" }>;
  generatedAt?: string;
  labels: {
    title: string;
    pros: string;
    risks: string;
    checklist: string;
    unconfirmed: string;
  };
  shareLabel?: string;
  onShare?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1 space-y-2">
      <p className="font-bold">{labels.title}</p>
      {generatedAt ? <p className="text-[11px] opacity-70">{generatedAt}</p> : null}
      {summary ? <p className="whitespace-pre-wrap text-[13px]">{summary}</p> : null}
      <div>
        <p className="text-[11px] font-bold text-[#166534]">{labels.pros}</p>
        <ul className="list-disc pl-4 text-[12px]">
          {pros.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
      <div>
        <p className="text-[11px] font-bold text-[#991B1B]">{labels.risks}</p>
        <ul className="list-disc pl-4 text-[12px]">
          {risks.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
      {checklist.length ? (
        <div>
          <button type="button" className="text-[12px] font-bold" onClick={() => setOpen((value) => !value)}>
            {labels.checklist} ({checklist.length})
          </button>
          {open
            ? checklist.map((item) => (
                <p
                  key={item.question}
                  className={`text-[12px] ${item.status === "risk" ? "text-[#991B1B]" : item.status === "unknown" ? "text-[#6B7280]" : ""}`}
                >
                  {item.question}: {item.answer || labels.unconfirmed}
                </p>
              ))
            : null}
        </div>
      ) : null}
      {onShare && shareLabel ? (
        <button type="button" onClick={onShare} className="mt-1 rounded-full bg-black px-3 py-1.5 text-[12px] font-bold text-white">
          {shareLabel}
        </button>
      ) : null}
    </div>
  );
}
