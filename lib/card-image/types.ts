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
  dataUrl: string;
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
  retry: string;
  error: string;
  imageError: string;
  openFallback: string;
  fileShareTitle: string;
};
