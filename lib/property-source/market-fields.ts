/**
 * Shared core + market-specific field maps (US / CA / TW).
 * Do not force three markets into one flat schema — use marketSpecific.
 */

export type MarketCode = "US" | "CA" | "TW" | "OTHER";

/** Core fields always present on PropertyData paths. */
export const CORE_FIELD_PATHS = [
  "location.normalizedAddress",
  "location.country",
  "listing.price",
  "listing.currency",
  "listing.bedrooms",
  "listing.bathrooms",
  "listing.area",
  "identity.propertyType",
  "identity.yearBuilt",
  "costs.hoaOrManagementFee",
  "costs.propertyTax",
] as const;

export const MARKET_SPECIFIC_FIELDS: Record<
  Exclude<MarketCode, "OTHER">,
  string[]
> = {
  US: [
    "hoaFee",
    "propertyTaxAnnual",
    "insuranceEstimate",
    "lotSizeSqft",
    "schoolDistrict",
    "floodZone",
    "zoning",
    "mlsId",
  ],
  CA: [
    "condoFee",
    "strataFee",
    "propertyTaxAnnual",
    "lotSize",
    "strataRules",
    "floodWildfireSnowRisk",
    "bilingualListing",
  ],
  TW: [
    "buildingPing",
    "mainBuildingPing",
    "commonAreaRatio",
    "landShare",
    "buildingAge",
    "floorOfTotal",
    "orientation",
    "managementFee",
    "parkingType",
    "objectType",
    "realPriceRegister",
    "nuisanceFacilities",
  ],
};

export function detectMarketFromAddress(address: string): MarketCode {
  const a = address.trim();
  if (!a) return "OTHER";
  if (
    /台灣|臺灣|台北|臺北|新北|桃園|台中|臺中|台南|臺南|高雄|台灣省|ROC/i.test(a) ||
    /\b(TW|TWN)\b/i.test(a)
  ) {
    return "TW";
  }
  if (
    /Canada|加拿大|BC|Ontario|Quebec|Alberta|Vancouver|Toronto|Montreal|Ottawa/i.test(
      a,
    ) ||
    /\b(CA|CAN)\b/i.test(a) ||
    /[A-Z]\d[A-Z]\s?\d[A-Z]\d/i.test(a)
  ) {
    return "CA";
  }
  if (
    /USA|United States|美國|,?\s*(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY)\s+\d{5}/i.test(
      a,
    ) ||
    /\b\d{5}(-\d{4})?\b/.test(a)
  ) {
    return "US";
  }
  // Taiwan-style: 縣市 + 區/鄉/鎮 + 路/街/巷
  if (/[縣市].*[區鄉鎮市].*[路街巷弄號]/u.test(a) || /[路街巷弄]\d*號/u.test(a)) {
    return "TW";
  }
  return "OTHER";
}

export function marketSpecificTemplate(
  market: MarketCode,
): Record<string, unknown> {
  if (market === "OTHER") return {};
  const out: Record<string, unknown> = {};
  for (const key of MARKET_SPECIFIC_FIELDS[market]) {
    out[key] = null;
  }
  return out;
}

/** Map free-text labels into marketSpecific keys when possible. */
export function mapExtractedLabelToMarketField(
  market: MarketCode,
  label: string,
): string | null {
  const l = label.toLowerCase();
  if (market === "US") {
    if (/hoa/.test(l)) return "hoaFee";
    if (/property\s*tax|稅/.test(l)) return "propertyTaxAnnual";
    if (/flood/.test(l)) return "floodZone";
    if (/mls/.test(l)) return "mlsId";
    if (/zoning/.test(l)) return "zoning";
    if (/school/.test(l)) return "schoolDistrict";
  }
  if (market === "CA") {
    if (/condo\s*fee|strata\s*fee/.test(l)) return "condoFee";
    if (/strata/.test(l)) return "strataRules";
    if (/property\s*tax/.test(l)) return "propertyTaxAnnual";
  }
  if (market === "TW") {
    if (/公設|公設比/.test(label)) return "commonAreaRatio";
    if (/主建物/.test(label)) return "mainBuildingPing";
    if (/管理費/.test(label)) return "managementFee";
    if (/車位|機械車位/.test(label)) return "parkingType";
    if (/朝向/.test(label)) return "orientation";
    if (/預售|新成屋|中古屋|法拍/.test(label)) return "objectType";
    if (/實價登錄/.test(label)) return "realPriceRegister";
    if (/坪/.test(label) && /總/.test(label)) return "buildingPing";
  }
  return null;
}
