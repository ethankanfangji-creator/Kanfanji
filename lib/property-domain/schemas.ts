import { z } from "zod";
import { DOMAIN_SCHEMA_VERSION } from "./models";
import { PROVENANCE_STATUSES } from "./provenance";

export const ProvenanceStatusSchema = z.enum(PROVENANCE_STATUSES);

export function provenancedSchema<T extends z.ZodTypeAny>(valueSchema: T) {
  return z.object({
    value: valueSchema.nullable(),
    unit: z.string().nullable(),
    source: z.string().nullable(),
    sourceUrl: z.string().nullable(),
    retrievedAt: z.string().nullable(),
    effectiveDate: z.string().nullable(),
    confidence: z.number().min(0).max(1).nullable(),
    evidenceIds: z.array(z.string()),
    limitations: z.string().nullable(),
    status: ProvenanceStatusSchema,
  });
}

/** Found/needs_human values that are non-null should cite at least one evidence id. */
export function assertEvidenceCited(
  field: {
    value: unknown;
    status: z.infer<typeof ProvenanceStatusSchema>;
    evidenceIds: string[];
  },
  path: string,
): string | null {
  if (
    (field.status === "found" || field.status === "needs_human") &&
    field.value != null &&
    field.evidenceIds.length === 0
  ) {
    return `${path}: non-null ${field.status} value requires evidenceIds`;
  }
  return null;
}

const PString = provenancedSchema(z.string());
const PNumber = provenancedSchema(z.number());
const PFeeKind = provenancedSchema(
  z.enum(["hoa", "strata", "condo", "management", "other"]),
);
const PRiskKind = provenancedSchema(
  z.enum(["flood", "earthquake", "wildfire", "noise", "other"]),
);

export const AddressComponentsSchema = z.object({
  streetNumber: PString,
  streetName: PString,
  city: PString,
  admin1: PString,
  county: PString,
  district: PString,
  section: PString,
  doorplate: PString,
  postalCode: PString,
  country: PString,
});

export const AddressSchema = z.object({
  input: z.string(),
  normalized: PString,
  display: PString,
  components: AddressComponentsSchema,
  placeId: PString,
  jurisdictionKey: PString,
  unitHint: PString,
});

export const GeocodingResultSchema = z.object({
  lat: PNumber,
  lng: PNumber,
  provider: PString,
  matchLevel: PString,
  displayAddress: PString,
  geocodeOk: z.boolean(),
});

export const PropertySchema = z.object({
  propertyType: PString,
  yearBuilt: PNumber,
  buildingArea: PNumber,
  lotArea: PNumber,
  bedrooms: PNumber,
  bathrooms: PNumber,
  parking: PString,
  condition: PString,
  parcelId: PString,
  buildingId: PString,
});

export const ListingSchema = z.object({
  listingId: PString,
  price: PString,
  status: PString,
  propertyType: PString,
  bedrooms: PNumber,
  bathrooms: PNumber,
  area: PNumber,
  currency: PString,
});

export const TransactionSchema = z.object({
  soldPrice: PString,
  soldDate: PString,
  instrument: PString,
  currency: PString,
});

export const BuildingPermitSchema = z.object({
  permitId: PString,
  permitType: PString,
  status: PString,
  issuedAt: PString,
  summary: PString,
});

export const AssessmentSchema = z.object({
  assessedValue: PString,
  assessedYear: PString,
  rollNumber: PString,
  currency: PString,
});

export const TaxRecordSchema = z.object({
  amount: PString,
  taxYear: PString,
  jurisdiction: PString,
  currency: PString,
});

export const HOAOrManagementFeeSchema = z.object({
  amount: PString,
  period: PString,
  feeKind: PFeeKind,
  currency: PString,
});

export const ZoningRecordSchema = z.object({
  code: PString,
  label: PString,
  landUse: PString,
});

export const NearbyPlaceSchema = z.object({
  name: PString,
  kind: PString,
  straightLineMeters: PNumber,
  walkingMinutes: PNumber,
  drivingMinutes: PNumber,
  peakDrivingMinutes: PNumber,
});

export const TransitStopSchema = z.object({
  name: PString,
  mode: PString,
  straightLineMeters: PNumber,
  walkingMinutes: PNumber,
  drivingMinutes: PNumber,
});

export const MarketComparableSchema = z.object({
  address: PString,
  price: PString,
  soldDate: PString,
  distanceMeters: PNumber,
  currency: PString,
});

export const RiskRecordSchema = z.object({
  kind: PRiskKind,
  levelOrNote: PString,
});

export const EvidenceSchema = z.object({
  id: z.string().min(1),
  field: z.string(),
  value: z.unknown(),
  unit: z.string().nullable(),
  source: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  retrievedAt: z.string().nullable(),
  effectiveDate: z.string().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  evidence: z.string().nullable(),
  limitations: z.string().nullable(),
  status: z.enum(["found", "needs_human", "conflict"]),
  matchLevel: z.string().nullable(),
});

export const DataGapSchema = z.object({
  fieldPath: z.string().min(1),
  reason: z.enum([
    "not_found",
    "needs_human",
    "expired",
    "out_of_jurisdiction",
    "provider_unavailable",
    "conflict",
  ]),
  note: z.string().nullable(),
});

export const DomainCountryAdapterSchema = z.object({
  id: z.string(),
  units: z.object({
    area: z.string(),
    currency: z.string(),
  }),
  availableDataTypes: z.array(z.string()),
  providersPreferred: z.array(z.string()),
  providersDisabled: z.array(z.string()),
  structuralGaps: z.array(z.string()),
  legalNotices: z.array(z.string()),
  feeLabel: z.string(),
  feeLabelZh: z.string(),
});

export const DomainPropertyReportSchema = z
  .object({
    schemaVersion: z.literal(DOMAIN_SCHEMA_VERSION),
    address: AddressSchema,
    geocoding: GeocodingResultSchema,
    property: PropertySchema,
    listing: ListingSchema,
    transactions: z.array(TransactionSchema),
    permits: z.array(BuildingPermitSchema),
    assessment: AssessmentSchema,
    tax: TaxRecordSchema,
    hoa: HOAOrManagementFeeSchema,
    zoning: ZoningRecordSchema,
    nearby: z.array(NearbyPlaceSchema),
    transit: z.array(TransitStopSchema),
    comparables: z.array(MarketComparableSchema),
    risks: z.array(RiskRecordSchema),
    evidence: z.array(EvidenceSchema),
    dataGaps: z.array(DataGapSchema),
    adapter: DomainCountryAdapterSchema.nullable(),
    disclaimer: z.string(),
    narrativeSummaryZh: z.string().nullable(),
  })
  .superRefine((report, ctx) => {
    const known = new Set(report.evidence.map((e) => e.id));
    const check = (
      field: {
        value: unknown;
        status: z.infer<typeof ProvenanceStatusSchema>;
        evidenceIds: string[];
      },
      path: string,
    ) => {
      const err = assertEvidenceCited(field, path);
      if (err) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: err, path: path.split(".") });
      }
      for (const id of field.evidenceIds) {
        if (!known.has(id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${path}: unknown evidence id ${id}`,
            path: path.split("."),
          });
        }
      }
    };

    check(report.property.yearBuilt, "property.yearBuilt");
    check(report.property.bedrooms, "property.bedrooms");
    check(report.listing.price, "listing.price");
    check(report.hoa.amount, "hoa.amount");
    check(report.tax.amount, "tax.amount");
    check(report.assessment.assessedValue, "assessment.assessedValue");
  });

export type DomainPropertyReportParsed = z.infer<typeof DomainPropertyReportSchema>;
