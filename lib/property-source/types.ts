/**
 * User-provided property sources + merged PropertyData for initial reports.
 * External listings/pages are untrusted; never treat as system instructions.
 */

export type PropertySourceType =
  | "listing_url"
  | "user_text"
  | "image"
  | "pdf"
  | "chat_message";

/** Optional semantic role for uploads (e.g. HOA / management fee docs). */
export type PropertySourceRole = "listing" | "hoa_doc" | "other";

export type PropertySource = {
  sourceId: string;
  sourceType: PropertySourceType;
  /** Original text or storage path / blob ref */
  originalContent: string;
  extractedText: string | null;
  sourceUrl: string | null;
  publisher: string | null;
  retrievedAt: string;
  country: string | null;
  language: string | null;
  confidence: number;
  extractionErrors: string[];
  /** MIME for uploads */
  mimeType?: string | null;
  fileName?: string | null;
  /** Semantic role — e.g. hoa_doc prioritizes fee extraction notes */
  sourceRole?: PropertySourceRole | null;
};

export type PipelineStepName =
  | "ingest"
  | "validate"
  | "extract"
  | "normalize"
  | "classify"
  | "enrich"
  | "crossCheck"
  | "score"
  | "summarize"
  | "report"
  | "followup";

export type PipelineStepStatus =
  | "pending"
  | "running"
  | "completed"
  | "skipped"
  | "error";

export type PipelineStepLog = {
  step: PipelineStepName;
  status: PipelineStepStatus;
  startedAt: string | null;
  completedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  sourceReferences: string[];
  retryCount: number;
};

export type VerificationStatus =
  | "verified"
  | "unverified"
  | "inferred"
  | "conflicting";

/** Spec-aligned field wrapper (compatible with provenance ideology). */
export type SourcedField<T = string> = {
  value: T | null;
  normalizedValue: string | null;
  sourceIds: string[];
  confidence: number;
  verificationStatus: VerificationStatus;
  notes: string;
};

export function emptySourcedField<T = string>(
  status: VerificationStatus = "unverified",
): SourcedField<T> {
  return {
    value: null,
    normalizedValue: null,
    sourceIds: [],
    confidence: 0,
    verificationStatus: status,
    notes: "",
  };
}

export function sourcedField<T>(
  value: T,
  opts: Partial<Omit<SourcedField<T>, "value">> & { sourceIds?: string[] } = {},
): SourcedField<T> {
  return {
    value,
    normalizedValue: opts.normalizedValue ?? String(value),
    sourceIds: opts.sourceIds ?? [],
    confidence: opts.confidence ?? 0.5,
    verificationStatus: opts.verificationStatus ?? "unverified",
    notes: opts.notes ?? "",
  };
}

export type PropertyIdentity = {
  listingId: SourcedField;
  propertyType: SourcedField;
  yearBuilt: SourcedField<number>;
  floors: SourcedField;
  unit: SourcedField;
};

export type LocationData = {
  inputAddress: string;
  normalizedAddress: SourcedField;
  country: SourcedField;
  admin1: SourcedField;
  city: SourcedField;
  district: SourcedField;
  postalCode: SourcedField;
  lat: SourcedField<number>;
  lng: SourcedField<number>;
};

export type ListingData = {
  price: SourcedField;
  currency: SourcedField;
  status: SourcedField;
  bedrooms: SourcedField<number>;
  bathrooms: SourcedField<number>;
  area: SourcedField<number>;
  areaUnit: SourcedField;
  description: SourcedField;
};

export type ConditionData = {
  knownCondition: SourcedField;
  photoObservations: SourcedField[];
  needsInspection: SourcedField[];
  unverifiableFromPhotos: SourcedField[];
  conditionConfidence: number;
};

export type CostData = {
  listPrice: SourcedField;
  hoaOrManagementFee: SourcedField;
  propertyTax: SourcedField;
  insuranceEstimate: SourcedField;
  parkingFee: SourcedField;
  holdingCostEstimate: SourcedField;
};

export type AmenityData = {
  parking: SourcedField;
  elevator: SourcedField;
  appliances: SourcedField;
  other: SourcedField[];
};

export type NeighborhoodData = {
  grocery: SourcedField;
  medical: SourcedField;
  schools: SourcedField;
  dining: SourcedField;
  parks: SourcedField;
  commercial: SourcedField;
  custom: SourcedField[];
};

export type TransportationData = {
  walkConvenience: SourcedField;
  driveConvenience: SourcedField;
  transitConvenience: SourcedField;
  nearestTransit: SourcedField;
  commuteNotes: SourcedField;
};

export type RiskItem = {
  id: string;
  priority: "high" | "medium" | "low";
  description: string;
  rationale: string;
  sourceIds: string[];
  confidence: number;
  howToVerify: string;
  askWhom: string;
};

export type PropertyData = {
  identity: PropertyIdentity;
  location: LocationData;
  listing: ListingData;
  condition: ConditionData;
  costs: CostData;
  amenities: AmenityData;
  neighborhood: NeighborhoodData;
  transportation: TransportationData;
  risks: RiskItem[];
  marketSpecific?: Record<string, unknown>;
};

export function createEmptyPropertyData(inputAddress = ""): PropertyData {
  return {
    identity: {
      listingId: emptySourcedField(),
      propertyType: emptySourcedField(),
      yearBuilt: emptySourcedField<number>(),
      floors: emptySourcedField(),
      unit: emptySourcedField(),
    },
    location: {
      inputAddress,
      normalizedAddress: emptySourcedField(),
      country: emptySourcedField(),
      admin1: emptySourcedField(),
      city: emptySourcedField(),
      district: emptySourcedField(),
      postalCode: emptySourcedField(),
      lat: emptySourcedField<number>(),
      lng: emptySourcedField<number>(),
    },
    listing: {
      price: emptySourcedField(),
      currency: emptySourcedField(),
      status: emptySourcedField(),
      bedrooms: emptySourcedField<number>(),
      bathrooms: emptySourcedField<number>(),
      area: emptySourcedField<number>(),
      areaUnit: emptySourcedField(),
      description: emptySourcedField(),
    },
    condition: {
      knownCondition: emptySourcedField(),
      photoObservations: [],
      needsInspection: [],
      unverifiableFromPhotos: [],
      conditionConfidence: 0,
    },
    costs: {
      listPrice: emptySourcedField(),
      hoaOrManagementFee: emptySourcedField(),
      propertyTax: emptySourcedField(),
      insuranceEstimate: emptySourcedField(),
      parkingFee: emptySourcedField(),
      holdingCostEstimate: emptySourcedField(),
    },
    amenities: {
      parking: emptySourcedField(),
      elevator: emptySourcedField(),
      appliances: emptySourcedField(),
      other: [],
    },
    neighborhood: {
      grocery: emptySourcedField(),
      medical: emptySourcedField(),
      schools: emptySourcedField(),
      dining: emptySourcedField(),
      parks: emptySourcedField(),
      commercial: emptySourcedField(),
      custom: [],
    },
    transportation: {
      walkConvenience: emptySourcedField(),
      driveConvenience: emptySourcedField(),
      transitConvenience: emptySourcedField(),
      nearestTransit: emptySourcedField(),
      commuteNotes: emptySourcedField(),
    },
    risks: [],
    marketSpecific: {},
  };
}

export function createSourceId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `src_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export const PIPELINE_STEPS: PipelineStepName[] = [
  "ingest",
  "validate",
  "extract",
  "normalize",
  "classify",
  "enrich",
  "crossCheck",
  "score",
  "summarize",
  "report",
  "followup",
];

export function createPendingStepLogs(): PipelineStepLog[] {
  return PIPELINE_STEPS.map((step) => ({
    step,
    status: "pending",
    startedAt: null,
    completedAt: null,
    errorCode: null,
    errorMessage: null,
    sourceReferences: [],
    retryCount: 0,
  }));
}
