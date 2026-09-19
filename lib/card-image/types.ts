import type { DecisionSummarySnapshot } from "@/lib/share-card";

export type CardImagePhotoSource = {
  id: string;
  url?: string;
  mediaId?: string;
};

export type PreparedCardImagePhoto = {
  id: string;
  tag: string;
  note: string;
  /** Downscaled JPEG blob — prefer over data URLs to limit peak memory. */
  blob: Blob;
  width: number;
  height: number;
};

export type CardImageModel = {
  snapshot: DecisionSummarySnapshot;
  photos: PreparedCardImagePhoto[];
  fileName: string;
};

export type CardImageDocumentLabels = {
  title: string;
  viewingAt: string;
  basics: string;
  unit: string;
  price: string;
  layout: string;
  area: string;
  managementFee: string;
  listingUrl: string;
  setupNotes: string;
  rating: string;
  ratingEmpty: string;
  pros: string;
  risks: string;
  photos: string;
  photoNote: string;
  facts: string;
  followUps: string;
  actionItems: string;
  emptySection: string;
  generatedAt: string;
};

export type CardImageExportUiLabels = {
  button: string;
  preparingImages: string;
  generating: string;
  success: string;
  readyHint: string;
  retry: string;
  error: string;
  imageError: string;
  openFallback: string;
  fileShareTitle: string;
};

/** Matches DecisionSummaryCard section order after header/basics/rating. */
export const CARD_IMAGE_CONTENT_SECTIONS = [
  "pros",
  "risks",
  "photos",
  "facts",
  "followUps",
  "actionItems",
] as const;
