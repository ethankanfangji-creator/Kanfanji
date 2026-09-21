import type { Jurisdiction, LaneId, PropertyRegion } from "./types";

const BC_METRO = new Set([
  "vancouver",
  "burnaby",
  "richmond",
  "surrey",
  "coquitlam",
  "port coquitlam",
  "port moody",
  "new westminster",
  "north vancouver",
  "west vancouver",
  "delta",
  "langley",
  "maple ridge",
  "pitt meadows",
  "white rock",
]);

const CA_PROVINCES: Record<string, string> = {
  bc: "BC",
  "b.c.": "BC",
  "british columbia": "BC",
  ab: "AB",
  alberta: "AB",
  on: "ON",
  ontario: "ON",
  qc: "QC",
  quebec: "QC",
  québec: "QC",
  sk: "SK",
  saskatchewan: "SK",
  mb: "MB",
  manitoba: "MB",
  ns: "NS",
  "nova scotia": "NS",
  nb: "NB",
  "new brunswick": "NB",
  nl: "NL",
  "newfoundland and labrador": "NL",
  pe: "PE",
  "prince edward island": "PE",
  yt: "YT",
  yukon: "YT",
  nt: "NT",
  "northwest territories": "NT",
  nu: "NU",
  nunavut: "NU",
};

function slug(value: string | null | undefined, fallback: string): string {
  const s = (value || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\u4e00-\u9fff-]/g, "");
  return s || fallback;
}

export function normalizeCaProvince(admin1: string | null | undefined): string | null {
  if (!admin1) return null;
  const key = admin1.trim().toLowerCase();
  return CA_PROVINCES[key] ?? admin1.trim().toUpperCase();
}

export function isBcMetroMunicipality(jurisdiction: Jurisdiction): boolean {
  if (jurisdiction.region !== "CA") return false;
  if (normalizeCaProvince(jurisdiction.admin1) !== "BC") return false;
  const name = (jurisdiction.municipality || jurisdiction.city || "").toLowerCase();
  return BC_METRO.has(name);
}

/**
 * Jurisdiction key selects the adapter. Two counties never share a US key.
 */
export function jurisdictionKey(jurisdiction: Jurisdiction, lane?: LaneId): string {
  const laneSuffix = lane ? `:${lane}` : "";
  if (jurisdiction.region === "US") {
    return `us:${slug(jurisdiction.admin1, "unknown-state")}:${slug(jurisdiction.county, "unknown-county")}:${slug(jurisdiction.city, "unknown-city")}${laneSuffix}`;
  }
  if (jurisdiction.region === "CA") {
    const province = normalizeCaProvince(jurisdiction.admin1);
    const muni = jurisdiction.municipality || jurisdiction.city;
    return `ca:${slug(province, "unknown-province")}:${slug(muni, "unknown-municipality")}${laneSuffix}`;
  }
  if (jurisdiction.region === "TW") {
    const city = jurisdiction.admin1 || jurisdiction.city;
    return `tw:${slug(city, "unknown-city")}:${slug(jurisdiction.district, "unknown-district")}:${slug(jurisdiction.section, "unknown-section")}${laneSuffix}`;
  }
  return `other:unknown${laneSuffix}`;
}

export function emptyJurisdiction(region: PropertyRegion = "OTHER"): Jurisdiction {
  return {
    region,
    admin1: null,
    county: null,
    city: null,
    municipality: null,
    district: null,
    section: null,
    doorplate: null,
  };
}

export function deriveJurisdiction(input: {
  region: PropertyRegion;
  query: string;
  admin1?: string | null;
  city?: string | null;
  county?: string | null;
  municipality?: string | null;
  district?: string | null;
  section?: string | null;
  houseNumber?: string | null;
}): Jurisdiction {
  const query = input.query.normalize("NFKC");
  const section =
    input.section ||
    query.match(/(?<=區)([\u4e00-\u9fff]{1,6}段)/)?.[1] ||
    query.match(/([\u4e00-\u9fff]{1,4}段)/)?.[1] ||
    null;
  const doorFromText = query.match(/(\d+\s*號)/)?.[1]?.replace(/\s+/g, "") ?? null;
  const districtFromText =
    query.match(/(?<=市|縣)([\u4e00-\u9fff]{1,4}區)/)?.[1] ??
    query.match(/([\u4e00-\u9fff]{1,4}鄉)/)?.[1] ??
    query.match(/([\u4e00-\u9fff]{1,4}鎮)/)?.[1] ??
    null;
  const twCity =
    query.match(/(臺北市|台北市|新北市|桃園市|臺中市|台中市|臺南市|台南市|高雄市|基隆市|新竹市|嘉義市|[\u4e00-\u9fff]{1,3}縣)/)?.[1]?.replace(/台/g, "臺") ??
    null;
  const countyFromText = query.match(/\b([A-Za-z][A-Za-z .'-]+ County)\b/)?.[1] ?? null;

  if (input.region === "TW") {
    return {
      region: "TW",
      admin1: twCity || input.admin1 || null,
      county: null,
      city: twCity || input.city || input.admin1 || null,
      municipality: null,
      district: input.district || districtFromText,
      section,
      doorplate: input.houseNumber || doorFromText,
    };
  }

  if (input.region === "US") {
    return {
      region: "US",
      admin1: input.admin1 || null,
      county: input.county || countyFromText,
      city: input.city || null,
      municipality: null,
      district: null,
      section: null,
      doorplate: input.houseNumber || null,
    };
  }

  if (input.region === "CA") {
    return {
      region: "CA",
      admin1: normalizeCaProvince(input.admin1),
      county: null,
      city: input.city || null,
      municipality: input.municipality || input.city || null,
      district: null,
      section: null,
      doorplate: input.houseNumber || null,
    };
  }

  return emptyJurisdiction(input.region);
}
