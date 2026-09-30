import { extensionFor } from "@/lib/media-paths";
import { isViewingMediaPath } from "@/lib/media-sign";

export const CARD_SCORES = ["good", "bad", "unsure"] as const;
export type CardScore = (typeof CARD_SCORES)[number];

export type CardPhoto = {
  path: string;
  url: string;
};

export type ViewingCardState = {
  templateId: string;
  status: CardScore | null;
  notes: string;
  photos: CardPhoto[];
};

const NOTES_MAX = 2000;

export function cardScore(value: string): CardScore | null {
  return (CARD_SCORES as readonly string[]).includes(value) ? (value as CardScore) : null;
}

export function cardNotes(value: string): string | null {
  const notes = value.replace(/\u0000/g, "").trim();
  if (notes.length > NOTES_MAX) return null;
  return notes;
}

export function cardPhotoStoragePath(input: {
  ownerId: string;
  viewingId: string;
  cardId: string;
  file: Blob;
}): string {
  const extension = extensionFor(input.file, "jpg");
  const filename = `${crypto.randomUUID()}.${extension}`;
  const path = `${input.ownerId}/${input.viewingId}/photos/${input.cardId}/${filename}`;
  if (!isStoredCardPhotoPath(path, input.ownerId, input.viewingId, input.cardId)) {
    throw new Error("INVALID_MEDIA_PATH");
  }
  return path;
}

export function isStoredCardPhotoPath(
  path: string,
  ownerId: string,
  viewingId: string,
  cardId: string,
): boolean {
  if (path.startsWith("http://") || path.startsWith("https://")) return false;
  const prefix = `${ownerId}/${viewingId}/photos/${cardId}/`;
  return path.startsWith(prefix) && isViewingMediaPath(path);
}
