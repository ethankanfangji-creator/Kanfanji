"use client";

import type { InitialPropertyReport } from "@/lib/property-source/initial-report-schema";

export function QuestionsToAskList({
  questions,
}: {
  questions: InitialPropertyReport["questionsToAsk"];
}) {
  if (!questions.length) return null;
  return (
    <div>
      <p className="text-[12px] font-bold">建議詢問</p>
      <ul className="mt-1 space-y-1.5">
        {questions.map((q) => (
          <li key={q.id} className="rounded-xl bg-[#EFF6FF] px-3 py-2 text-[12px]">
            <span className="font-semibold">{q.question}</span>
            <span className="mt-0.5 block text-[11px] text-[#6B7280]">
              → {q.askWhom} ({q.priority})
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
