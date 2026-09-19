export type PropertyBasicsConfidence = "verified" | "inferred" | "unknown";

export type PropertyBasicsField = {
  value: string | null;
  confidence: PropertyBasicsConfidence;
  note?: string;
};

export type PropertyBasicsSnapshot = {
  address: string;
  displayName: PropertyBasicsField;
  propertyType: PropertyBasicsField;
  layout: PropertyBasicsField;
  area: PropertyBasicsField;
  price: PropertyBasicsField;
  managementFee: PropertyBasicsField;
  yearBuilt: PropertyBasicsField;
  summary: PropertyBasicsField;
  sources: string[];
  generatedAt: string;
  /** When the model refused because the prompt was not about this address. */
  needsAddressConfirmation?: boolean;
  message?: string;
};

export const UNKNOWN_PROPERTY_FIELD: PropertyBasicsField = {
  value: null,
  confidence: "unknown",
  note: "unknown",
};

export function emptyPropertyBasics(address: string): PropertyBasicsSnapshot {
  return {
    address,
    displayName: { value: address || null, confidence: address ? "verified" : "unknown" },
    propertyType: { ...UNKNOWN_PROPERTY_FIELD },
    layout: { ...UNKNOWN_PROPERTY_FIELD },
    area: { ...UNKNOWN_PROPERTY_FIELD },
    price: { ...UNKNOWN_PROPERTY_FIELD },
    managementFee: { ...UNKNOWN_PROPERTY_FIELD },
    yearBuilt: { ...UNKNOWN_PROPERTY_FIELD },
    summary: { ...UNKNOWN_PROPERTY_FIELD },
    sources: [],
    generatedAt: new Date().toISOString(),
  };
}

function asField(raw: unknown, fallback: PropertyBasicsField = UNKNOWN_PROPERTY_FIELD): PropertyBasicsField {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...fallback };
  const obj = raw as Record<string, unknown>;
  const confidence =
    obj.confidence === "verified" || obj.confidence === "inferred" || obj.confidence === "unknown"
      ? obj.confidence
      : "unknown";
  const value =
    typeof obj.value === "string" && obj.value.trim() && !/^unknown|待確認|未知|n\/?a$/i.test(obj.value.trim())
      ? obj.value.trim().slice(0, 200)
      : null;
  return {
    value: confidence === "unknown" ? null : value,
    confidence: value ? confidence : "unknown",
    note: typeof obj.note === "string" ? obj.note.trim().slice(0, 200) : undefined,
  };
}

/**
 * Normalize model JSON into a safe PropertyBasicsSnapshot.
 * Fabricated listing economics are forced to unknown.
 */
export function normalizePropertyBasics(
  raw: unknown,
  confirmedAddress: string,
  sources: string[],
): PropertyBasicsSnapshot {
  const base = emptyPropertyBasics(confirmedAddress);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const obj = raw as Record<string, unknown>;

  if (obj.needsAddressConfirmation === true) {
    return {
      ...base,
      needsAddressConfirmation: true,
      message:
        typeof obj.message === "string" && obj.message.trim()
          ? obj.message.trim().slice(0, 400)
          : "Please confirm a property address first.",
      sources,
    };
  }

  // Never trust model-invented price / area / layout / fee as verified.
  const price = asField(obj.price);
  const area = asField(obj.area);
  const layout = asField(obj.layout);
  const managementFee = asField(obj.managementFee);

  return {
    address: confirmedAddress,
    displayName: asField(obj.displayName, {
      value: confirmedAddress,
      confidence: "verified",
    }),
    propertyType: asField(obj.propertyType),
    layout: { ...layout, confidence: layout.value ? "inferred" : "unknown" },
    area: { ...area, confidence: "unknown", value: null, note: area.note ?? "Needs listing verification" },
    price: { ...price, confidence: "unknown", value: null, note: price.note ?? "Needs listing verification" },
    managementFee: {
      ...managementFee,
      confidence: "unknown",
      value: null,
      note: managementFee.note ?? "Needs listing verification",
    },
    yearBuilt: asField(obj.yearBuilt),
    summary: asField(obj.summary),
    sources: Array.isArray(obj.sources)
      ? [
          ...sources,
          ...obj.sources.filter((s): s is string => typeof s === "string" && Boolean(s.trim())),
        ].slice(0, 8)
      : sources,
    generatedAt: new Date().toISOString(),
    needsAddressConfirmation: false,
    message: typeof obj.message === "string" ? obj.message.trim().slice(0, 400) : undefined,
  };
}

export function isPropertyBasicsSnapshot(value: unknown): value is PropertyBasicsSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.address === "string" && typeof obj.generatedAt === "string";
}
