/** Stable on-site inspection checklist ids — labels from i18n. */
export const FIELD_CHECKLIST_IDS = [
  "water_leak",
  "wall_crack",
  "window_fog",
  "light_air",
  "noise",
  "electrical_panel",
  "water_heater",
  "plumbing",
  "amenities",
  "parking",
] as const;

export type FieldChecklistPresetId = (typeof FIELD_CHECKLIST_IDS)[number];

export type FieldChecklistItem = {
  id: string;
  /** Preset id or `custom:<uuid>` */
  key: string;
  text: string;
  checked: boolean;
  note: string;
  custom: boolean;
  sortOrder: number;
};

export function createPresetChecklist(
  labels: Record<FieldChecklistPresetId, string>,
): FieldChecklistItem[] {
  return FIELD_CHECKLIST_IDS.map((key, index) => ({
    id: `preset:${key}`,
    key,
    text: labels[key],
    checked: false,
    note: "",
    custom: false,
    sortOrder: index,
  }));
}

export function createCustomChecklistItem(text: string, sortOrder: number): FieldChecklistItem {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    key: `custom:${id}`,
    text: text.trim(),
    checked: false,
    note: "",
    custom: true,
    sortOrder,
  };
}

export function ensureFieldChecklist(
  current: FieldChecklistItem[] | undefined | null,
  labels: Record<FieldChecklistPresetId, string>,
): FieldChecklistItem[] {
  if (current && current.length > 0) return current;
  return createPresetChecklist(labels);
}
