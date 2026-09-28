import type { ComparisonDraft } from "./types";
import type { ThreadCompareColumn } from "./from-thread";

export function snapshotFromDraft(draft: ComparisonDraft, opts: { includeNotes: boolean }) {
  const columns = draft.columns.filter((column) => column.included).map((column) => {
    const cells: Record<string, { text?: string | null; list?: string[] }> = {
      address: { text: column.title },
      price: { text: column.fields.priceLabel },
      layout: { text: column.fields.layoutLabel },
      location: { text: column.fields.locationLabel },
      area: { text: column.fields.areaLabel },
      managementFee: { text: column.fields.managementFeeLabel },
      rating: { text: column.fields.overallRating == null ? null : String(column.fields.overallRating) },
      pros: { list: column.fields.pros },
      risks: { list: column.fields.risks },
      followUps: { list: column.fields.followUps },
    };
    if (opts.includeNotes) cells.notes = { text: column.notes };
    return { title: column.title, cells };
  });
  return {
    version: 2 as const,
    source: "viewings_list" as const,
    createdAt: new Date().toISOString(),
    rows: Object.keys(columns[0]?.cells ?? {}),
    columns,
  };
}

export function snapshotFromThreadColumns(columns: ThreadCompareColumn[]) {
  return {
    version: 2 as const,
    source: "chat_history" as const,
    createdAt: new Date().toISOString(),
    rows: ["address"],
    columns: columns.map((column) => ({
      title: column.rows.address?.text ?? "",
      cells: {
        address: { text: column.rows.address?.text ?? null },
        price: { text: column.rows.price?.text ?? null },
      },
    })),
  };
}
