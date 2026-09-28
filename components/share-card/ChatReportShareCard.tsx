export function ChatReportShareCard({
  address,
  generatedAt,
  summary,
  pros,
  risks,
  checklist,
  fields,
}: {
  address: string;
  generatedAt: string;
  summary: string | null;
  pros: string[];
  risks: string[];
  checklist: Array<{ question: string; answer: string; status: string }>;
  fields: Array<{ fieldId: string; value: string; status: string }>;
}) {
  return (
    <article className="rounded-[28px] bg-white p-6">
      <h1 className="text-[20px] font-bold">{address || "—"}</h1>
      <p className="mt-1 text-[12px] text-[#6B7280]">{generatedAt || "—"}</p>
      <p className="mt-3 whitespace-pre-wrap text-[14px]">{summary || "—"}</p>
      <h2 className="mt-4 text-[13px] font-bold text-[#166534]">Pros</h2>
      <ul className="list-disc pl-5 text-[13px]">
        {pros.length ? pros.map((item) => <li key={item}>{item}</li>) : <li>—</li>}
      </ul>
      <h2 className="mt-4 text-[13px] font-bold text-[#991B1B]">Risks</h2>
      <ul className="list-disc pl-5 text-[13px]">
        {risks.length ? risks.map((item) => <li key={item}>{item}</li>) : <li>—</li>}
      </ul>
      <h2 className="mt-4 text-[13px] font-bold">Checked fields</h2>
      <ul className="mt-1 space-y-1 text-[13px]">
        {fields.length
          ? fields.map((field) => (
              <li key={field.fieldId}>
                {field.value} <span className="text-[11px] text-[#6B7280]">{field.status}</span>
              </li>
            ))
          : <li>—</li>}
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
      <p className="mt-4 text-[11px] text-[#6B7280]">AI may be wrong. Confirm important facts yourself.</p>
    </article>
  );
}
