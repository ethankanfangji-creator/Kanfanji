import type { DecisionSummarySnapshot } from "@/lib/share-card";

export type PdfPhotoSource = {
  id: string;
  url?: string;
  mediaId?: string;
};

export type PreparedPdfPhoto = {
  id: string;
  tag: string;
  note: string;
  dataUrl: string;
};

export type PdfSummaryModel = {
  snapshot: DecisionSummarySnapshot;
  photos: PreparedPdfPhoto[];
  fileName: string;
};

export type PdfDocumentLabels = {
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
  page: string;
};

export type PdfExportUiLabels = {
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

