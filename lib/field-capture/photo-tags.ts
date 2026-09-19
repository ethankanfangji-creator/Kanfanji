/** Stable photo room/spot tag ids — labels come from i18n. */
export const PHOTO_TAG_IDS = [
  "living",
  "kitchen",
  "master_bedroom",
  "bathroom",
  "electrical_panel",
  "window",
  "balcony",
  "parking",
  "common_area",
  "exterior",
  "other",
] as const;

export type PhotoTagId = (typeof PHOTO_TAG_IDS)[number];

export function isPhotoTagId(value: string): value is PhotoTagId {
  return (PHOTO_TAG_IDS as readonly string[]).includes(value);
}

export function normalizePhotoTagId(value: string | undefined | null): PhotoTagId {
  if (value && isPhotoTagId(value)) return value;
  return "other";
}
