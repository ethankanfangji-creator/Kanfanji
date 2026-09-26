"use client";

import { useEffect, useRef, useState } from "react";
import type { CompareCell, CompareRowKey, ThreadCompareColumn } from "@/lib/comparison/from-thread";

export type CompareColumnView =
  | { kind: "found"; column: ThreadCompareColumn }
  | { kind: "missing"; threadId: string; message: string };

export type CompareBoardItem =
  | { type: "section"; id: string; label: string }
  | {
      type: "field";
      key: CompareRowKey;
      label: string;
      hint?: string;
      differs: boolean;
    };

type Labels = {
  empty: string;
  skipped: string;
  inferred: string;
  diff: string;
};

function cellHasValue(cell: CompareCell | undefined): boolean {
  if (!cell) return false;
  if (cell.list && cell.list.length > 0) return true;
  return cell.text != null && cell.text.trim() !== "";
}

function CellBody({
  cell,
  labels,
}: {
  cell: CompareCell | undefined;
  labels: Labels;
}) {
  if (!cell || (!cellHasValue(cell) && !cell.skipped)) {
    return <p className="text-[12px] leading-[1.4] text-[#9CA3AF]">{labels.empty}</p>;
  }
  if (cell.skipped && !cellHasValue(cell)) {
    return (
      <p className="text-[12px] leading-[1.4] text-[#9CA3AF]">
        {labels.empty}
        <span className="mt-0.5 block text-[10px]">{labels.skipped}</span>
      </p>
    );
  }
  const inferred =
    cell.provenance === "inferred" ? (
      <span className="mt-0.5 block text-[10px] text-[#6B7280]">{labels.inferred}</span>
    ) : null;
  if (cell.list && cell.list.length > 0) {
    return (
      <div>
        <ul className="space-y-1 text-[12px] leading-[1.4]">
          {cell.list.map((item) => (
            <li key={item}>• {item}</li>
          ))}
        </ul>
        {inferred}
      </div>
    );
  }
  return (
    <p className="whitespace-pre-wrap break-words text-[12px] leading-[1.4]">
      {cell.text}
      {inferred}
    </p>
  );
}

function FieldBlock({
  item,
  cell,
  labels,
  missing,
}: {
  item: Extract<CompareBoardItem, { type: "field" }>;
  cell: CompareCell | undefined;
  labels: Labels;
  missing: boolean;
}) {
  const highlight = item.differs && !missing && cellHasValue(cell);
  return (
    <div
      data-compare-diff={highlight ? "true" : undefined}
      className={`min-h-11 px-4 py-2 ${highlight ? "bg-[#FFFBEB]" : ""}`}
    >
      <p className="mb-1 text-[10px] font-bold tracking-wide text-[#6B7280]">
        <span title={item.hint}>{item.label}</span>
        {item.hint ? (
          <span className="ml-1 cursor-help text-[#9CA3AF]" title={item.hint}>
            ?
          </span>
        ) : null}
      </p>
      {missing ? null : <CellBody cell={cell} labels={labels} />}
      {highlight ? <span className="sr-only">{labels.diff}</span> : null}
    </div>
  );
}

export function ChatCompareBoard({
  columns,
  items,
  labels,
}: {
  columns: CompareColumnView[];
  items: CompareBoardItem[];
  labels: Labels;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    function onScroll() {
      const node = scrollerRef.current;
      if (!node) return;
      const card = node.querySelector("article");
      const width = (card?.getBoundingClientRect().width ?? 0) + 12;
      if (width <= 0) return;
      const next = Math.min(
        columns.length - 1,
        Math.max(0, Math.round(node.scrollLeft / width)),
      );
      setActive(next);
    }
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [columns.length]);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between md:hidden">
        <p className="text-[12px] font-bold text-[#374151]">
          {columns.length === 0 ? "0／0" : `${active + 1}／${columns.length}`}
        </p>
        <div className="flex gap-1" aria-hidden>
          {columns.map((column, index) => (
            <span
              key={column.kind === "found" ? column.column.threadId : column.threadId}
              className={`h-1.5 w-1.5 rounded-full ${
                index === active ? "bg-black" : "bg-black/20"
              }`}
            />
          ))}
        </div>
      </div>

      <div
        ref={scrollerRef}
        data-testid="compare-scroller"
        className="md:hidden -mx-4 overflow-x-auto snap-x snap-mandatory px-4 pb-4"
      >
        <div
          className="grid w-max gap-x-3"
          style={{
            gridTemplateRows: `auto repeat(${items.length}, minmax(2.75rem, auto))`,
            gridAutoColumns: "minmax(78vw, 320px)",
            gridAutoFlow: "column",
          }}
        >
          {columns.map((column) => {
            const id = column.kind === "found" ? column.column.threadId : column.threadId;
            const title =
              column.kind === "missing" ? column.message : column.column.title || labels.empty;
            return (
              <article
                key={id}
                data-testid="compare-column"
                className="snap-center grid max-w-[320px] rounded-[22px] border border-black/[0.05] bg-white shadow-[0_4px_20px_rgba(0,0,0,0.04)]"
                style={{
                  gridRow: `1 / span ${items.length + 1}`,
                  gridTemplateRows: "subgrid",
                }}
              >
                <h3 className="whitespace-pre-wrap break-words px-4 pb-2 pt-4 text-[15px] font-bold leading-[1.3]">
                  {title}
                </h3>
                {items.map((item) => {
                  if (item.type === "section") {
                    return (
                      <p
                        key={item.id}
                        className="bg-[#FAF7F3] px-4 py-2 text-[11px] font-bold tracking-wide text-[#6B7280]"
                      >
                        {item.label}
                      </p>
                    );
                  }
                  const cell =
                    column.kind === "found" ? column.column.rows[item.key] : undefined;
                  return (
                    <FieldBlock
                      key={item.key}
                      item={item}
                      cell={cell}
                      labels={labels}
                      missing={column.kind === "missing"}
                    />
                  );
                })}
              </article>
            );
          })}
        </div>
      </div>

      <div className="hidden overflow-auto rounded-[22px] border border-black/[0.05] bg-white shadow-[0_4px_20px_rgba(0,0,0,0.04)] md:block md:max-h-[calc(100svh-9rem)]">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-black/5">
              <th className="sticky left-0 top-0 z-30 w-[120px] bg-[#FAF7F3] p-3 text-[11px] font-bold">
                —
              </th>
              {columns.map((column) => {
                const id = column.kind === "found" ? column.column.threadId : column.threadId;
                const title =
                  column.kind === "missing"
                    ? column.message
                    : column.column.title || labels.empty;
                return (
                  <th
                    key={id}
                    data-testid="compare-column"
                    className="sticky top-0 z-20 min-w-[200px] bg-white p-3 align-top text-[14px] font-bold"
                  >
                    {title}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              if (item.type === "section") {
                return (
                  <tr key={item.id} className="border-b border-black/5 bg-[#FAF7F3]">
                    <th
                      colSpan={columns.length + 1}
                      className="sticky left-0 p-3 text-[11px] font-bold tracking-wide text-[#6B7280]"
                    >
                      {item.label}
                    </th>
                  </tr>
                );
              }
              return (
                <tr key={item.key} className="border-b border-black/5">
                  <th
                    className="sticky left-0 z-10 bg-[#FAF7F3] p-3 text-[11px] font-bold text-[#6B7280]"
                    title={item.hint}
                  >
                    {item.label}
                    {item.hint ? (
                      <span className="ml-1 cursor-help text-[#9CA3AF]" title={item.hint}>
                        ?
                      </span>
                    ) : null}
                  </th>
                  {columns.map((column) => {
                    const id =
                      column.kind === "found" ? column.column.threadId : column.threadId;
                    const cell =
                      column.kind === "found" ? column.column.rows[item.key] : undefined;
                    const highlight =
                      item.differs && column.kind === "found" && cellHasValue(cell);
                    return (
                      <td
                        key={id}
                        data-compare-diff={highlight ? "true" : undefined}
                        className={`min-w-[200px] p-3 align-top ${
                          highlight ? "bg-[#FFFBEB]" : ""
                        }`}
                      >
                        {column.kind === "missing" ? null : (
                          <CellBody cell={cell} labels={labels} />
                        )}
                        {highlight ? <span className="sr-only">{labels.diff}</span> : null}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
