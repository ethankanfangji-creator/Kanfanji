import type { ReactNode } from "react";

export function ChatReportShareCard({
  address,
  generatedAt,
  summary,
  pros,
  risks,
  checklist,
  fields,
  labels,
}: {
  address: string;
  generatedAt: ReactNode;
  summary: string | null;
  pros: string[];
  risks: string[];
  checklist: Array<{ question: string; answer: string; status: string }>;
  fields: Array<{ fieldId: string; value: string; status: string }>;
  labels: {
    pros: string;
    risks: string;
    checkedFields: string;
    empty: string;
    caution: string;
    fieldName: (fieldId: string) => string;
    statusName: (status: string) => string;
  };
}) {
  return (
    <article className="rounded-[28px] bg-white p-6">
      <h1 className="text-[20px] font-bold">{address || "—"}</h1>
      <p className="mt-1 text-[12px] text-[#6B7280]">{generatedAt || "—"}</p>
      <p className="mt-3 whitespace-pre-wrap text-[14px]">{summary || "—"}</p>
      <h2 className="mt-4 text-[13px] font-bold text-[#166534]">{labels.pros}</h2>
      <ul className="list-disc pl-5 text-[13px]">
        {pros.length ? pros.map((item) => <li key={item}>{item}</li>) : <li>{labels.empty}</li>}
      </ul>
      <h2 className="mt-4 text-[13px] font-bold text-[#991B1B]">{labels.risks}</h2>
      <ul className="list-disc pl-5 text-[13px]">
        {risks.length ? risks.map((item) => <li key={item}>{item}</li>) : <li>{labels.empty}</li>}
      </ul>
      <h2 className="mt-4 text-[13px] font-bold">{labels.checkedFields}</h2>
      <ul className="mt-1 space-y-1 text-[13px]">
        {fields.length ? (
          fields.map((field) => (
            <li key={field.fieldId} className="flex flex-wrap items-center gap-2">
              <span>
                {labels.fieldName(field.fieldId)}: {field.value}
              </span>
              <span className="rounded-full bg-[#F3F4F6] px-2 py-0.5 text-[11px] text-[#374151]">
                {labels.statusName(field.status)}
              </span>
            </li>
          ))
        ) : (
          <li>{labels.empty}</li>
        )}
      </ul>
      {checklist.length ? (
        <ul className="mt-3 text-[12px] text-[#4B5563]">
          {checklist.map((item) => (
            <li key={item.question}>
              {item.question}: {item.answer || "—"}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-4 text-[11px] text-[#6B7280]">{labels.caution}</p>
    </article>
  );
}
