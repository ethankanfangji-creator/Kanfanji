"use client";

import { displayOrEmpty, listOrEmpty, type ComparisonColumn } from "@/lib/comparison";

export type ComparisonBoardLabels = {
  empty: string;
  price: string;
  layout: string;
  location: string;
  area: string;
  managementFee: string;
  rating: string;
  pros: string;
  risks: string;
  followUps: string;
  notes: string;
  includeInShare: string;
};

const ROWS: Array<{
  key: keyof ComparisonBoardLabels;
  get: (col: ComparisonColumn, empty: string) => string | string[];
}> = [
  { key: "location", get: (c, e) => displayOrEmpty(c.fields.locationLabel, e) },
  { key: "price", get: (c, e) => displayOrEmpty(c.fields.priceLabel, e) },
  { key: "layout", get: (c, e) => displayOrEmpty(c.fields.layoutLabel, e) },
  { key: "area", get: (c, e) => displayOrEmpty(c.fields.areaLabel, e) },
  {
    key: "managementFee",
    get: (c, e) => displayOrEmpty(c.fields.managementFeeLabel, e),
  },
  {
    key: "rating",
    get: (c, e) =>
      c.fields.overallRating != null ? `${c.fields.overallRating} / 5` : e,
  },
  { key: "pros", get: (c, e) => listOrEmpty(c.fields.pros, e) },
  { key: "risks", get: (c, e) => listOrEmpty(c.fields.risks, e) },
  { key: "followUps", get: (c, e) => listOrEmpty(c.fields.followUps, e) },
];

type Props = {
  columns: ComparisonColumn[];
  labels: ComparisonBoardLabels;
  editing?: boolean;
  onChangeTitle?: (columnId: string, title: string) => void;
  onChangeNotes?: (columnId: string, notes: string) => void;
  onChangeList?: (
    columnId: string,
    field: "pros" | "risks" | "followUps",
    text: string,
  ) => void;
  onToggleIncluded?: (columnId: string) => void;
};

function CellValue({
  value,
  emptyLabel,
}: {
  value: string | string[];
  emptyLabel: string;
}) {
  if (Array.isArray(value)) {
    const isEmpty = value.length === 1 && value[0] === emptyLabel;
    return (
      <ul className={`space-y-1 text-[12px] leading-[1.4] ${isEmpty ? "text-[#9CA3AF]" : ""}`}>
        {value.map((item) => (
          <li key={item}>• {item}</li>
        ))}
      </ul>
    );
  }
  return (
    <p className={`text-[12px] leading-[1.4] ${value === emptyLabel ? "text-[#9CA3AF]" : ""}`}>
      {value}
    </p>
  );
}

export function ComparisonBoard({
  columns,
  labels,
  editing = false,
  onChangeTitle,
  onChangeNotes,
  onChangeList,
  onToggleIncluded,
}: Props) {
  return (
    <div className="space-y-4">
      {/* Mobile: horizontal cards */}
      <div className="md:hidden -mx-4 px-4 overflow-x-auto snap-x snap-mandatory flex gap-3 pb-2">
        {columns.map((col) => (
          <article
            key={col.id}
            className="snap-center shrink-0 w-[78vw] max-w-[320px] rounded-[22px] bg-white border border-black/[0.05] shadow-[0_4px_20px_rgba(0,0,0,0.04)] p-4"
          >
            {editing ? (
              <input
                value={col.title}
                onChange={(e) => onChangeTitle?.(col.id, e.target.value)}
                className="w-full text-[15px] font-bold outline-none border-b border-black/10 pb-1"
              />
            ) : (
              <h3 className="text-[15px] font-bold leading-[1.3]">{col.title}</h3>
            )}
            {editing && onToggleIncluded ? (
              <label className="mt-2 flex items-center gap-2 text-[11px] text-[#6B7280]">
                <input
                  type="checkbox"
                  checked={col.included}
                  onChange={() => onToggleIncluded(col.id)}
                />
                {labels.includeInShare}
              </label>
            ) : null}
            <dl className="mt-3 space-y-3">
              {ROWS.map((row) => (
                <div key={row.key}>
                  <dt className="text-[10px] font-bold tracking-wide text-[#6B7280] mb-1">
                    {labels[row.key]}
                  </dt>
                  <dd>
                    {editing &&
                    (row.key === "pros" || row.key === "risks" || row.key === "followUps") ? (
                      <textarea
                        value={col.fields[row.key].join("\n")}
                        onChange={(e) =>
                          onChangeList?.(
                            col.id,
                            row.key as "pros" | "risks" | "followUps",
                            e.target.value,
                          )
                        }
                        rows={3}
                        className="w-full text-[12px] rounded-xl border border-black/10 p-2 outline-none"
                      />
                    ) : (
                      <CellValue value={row.get(col, labels.empty)} emptyLabel={labels.empty} />
                    )}
                  </dd>
                </div>
              ))}
              <div>
                <dt className="text-[10px] font-bold tracking-wide text-[#6B7280] mb-1">
                  {labels.notes}
                </dt>
                <dd>
                  {editing ? (
                    <textarea
                      value={col.notes}
                      onChange={(e) => onChangeNotes?.(col.id, e.target.value)}
                      rows={2}
                      className="w-full text-[12px] rounded-xl border border-black/10 p-2 outline-none"
                    />
                  ) : (
                    <CellValue
                      value={displayOrEmpty(col.notes, labels.empty)}
                      emptyLabel={labels.empty}
                    />
                  )}
                </dd>
              </div>
            </dl>
          </article>
        ))}
      </div>

      {/* Desktop: matrix */}
      <div className="hidden md:block overflow-x-auto rounded-[22px] border border-black/[0.05] bg-white shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead>
            <tr className="border-b border-black/5">
              <th className="sticky left-0 z-10 bg-[#FAF7F3] p-3 text-[11px] font-bold w-[120px]">
                —
              </th>
              {columns.map((col) => (
                <th key={col.id} className="p-3 align-top min-w-[180px]">
                  {editing ? (
                    <input
                      value={col.title}
                      onChange={(e) => onChangeTitle?.(col.id, e.target.value)}
                      className="w-full text-[14px] font-bold outline-none border-b border-black/10 pb-1"
                    />
                  ) : (
                    <span className="text-[14px] font-bold">{col.title}</span>
                  )}
                  {editing && onToggleIncluded ? (
                    <label className="mt-2 flex items-center gap-2 text-[11px] font-medium text-[#6B7280]">
                      <input
                        type="checkbox"
                        checked={col.included}
                        onChange={() => onToggleIncluded(col.id)}
                      />
                      {labels.includeInShare}
                    </label>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.key} className="border-b border-black/5 align-top">
                <th className="sticky left-0 z-10 bg-[#FAF7F3] p-3 text-[11px] font-bold text-[#6B7280]">
                  {labels[row.key]}
                </th>
                {columns.map((col) => (
                  <td key={col.id} className="p-3">
                    {editing &&
                    (row.key === "pros" || row.key === "risks" || row.key === "followUps") ? (
                      <textarea
                        value={col.fields[row.key].join("\n")}
                        onChange={(e) =>
                          onChangeList?.(
                            col.id,
                            row.key as "pros" | "risks" | "followUps",
                            e.target.value,
                          )
                        }
                        rows={3}
                        className="w-full text-[12px] rounded-xl border border-black/10 p-2 outline-none"
                      />
                    ) : (
                      <CellValue value={row.get(col, labels.empty)} emptyLabel={labels.empty} />
                    )}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="align-top">
              <th className="sticky left-0 z-10 bg-[#FAF7F3] p-3 text-[11px] font-bold text-[#6B7280]">
                {labels.notes}
              </th>
              {columns.map((col) => (
                <td key={col.id} className="p-3">
                  {editing ? (
                    <textarea
                      value={col.notes}
                      onChange={(e) => onChangeNotes?.(col.id, e.target.value)}
                      rows={2}
                      className="w-full text-[12px] rounded-xl border border-black/10 p-2 outline-none"
                    />
                  ) : (
                    <CellValue
                      value={displayOrEmpty(col.notes, labels.empty)}
                      emptyLabel={labels.empty}
                    />
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
