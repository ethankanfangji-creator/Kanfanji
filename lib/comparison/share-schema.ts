import { z } from "zod";

const cell = z
  .object({
    text: z.string().max(300).nullable().optional(),
    list: z.array(z.string().max(200)).max(12).optional(),
    provenance: z.enum(["confirmed", "inferred", "corrected", "intel", "report"]).optional(),
  })
  .strict();

const rowKey = z.enum([
  "address", "viewedAt", "price", "area", "layout", "floor", "yearBuilt", "propertyType", "strata",
  "location", "managementFee", "rating", "transit", "schools", "supermarket", "park", "parking",
  "noise", "odor", "light", "water_damage", "electrical", "plumbing", "hvac",
  "pros", "cons", "risks", "followUps", "intelRiskTags", "notes",
]);

export const compareShareSnapshotSchema = z
  .object({
    version: z.literal(2),
    source: z.enum(["chat_history", "viewings_list"]),
    createdAt: z.string().max(40),
    rows: z.array(rowKey).max(40),
    columns: z.array(z.object({
      title: z.string().max(200),
      cells: z.partialRecord(rowKey, cell).optional(),
    }).strict()).min(2).max(5),
  })
  .strict();

export type CompareShareSnapshotV2 = z.infer<typeof compareShareSnapshotSchema>;

export function parseCompareShareSnapshot(value: unknown, columnCount: number) {
  const parsed = compareShareSnapshotSchema.parse(value);
  if (parsed.columns.length !== columnCount) throw new Error("column count");
  if (Buffer.byteLength(JSON.stringify(parsed)) > 65536) throw new Error("too large");
  return parsed;
}
