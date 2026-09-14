export type MetroOpenData = {
  city?: string;
  source?: string;
  zoningCode?: string;
  zoningLabel?: string;
  zoningCategory?: string;
  parcelAddress?: string;
  planNumber?: string;
  lotNumber?: string;
  pid?: string;
  rollNumber?: string;
  legalDescription?: string;
  hasCovenantHint?: boolean;
  hasEasementHint?: boolean;
  notes?: string[];
};

type ArcFeature = { attributes?: Record<string, unknown> };

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    next: { revalidate: 0 },
  });
  if (!res.ok) return null;
  return res.json();
}

function normalizeCity(city?: string) {
  return (city || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^city of /, "")
    .replace(/^district of /, "")
    .replace(/^township of /, "");
}

function arcPointQueryUrl(
  base: string,
  lng: number,
  lat: number,
  outFields = "*",
  distanceMeters = 25,
) {
  const url = new URL(base);
  url.searchParams.set("geometry", `${lng},${lat}`);
  url.searchParams.set("geometryType", "esriGeometryPoint");
  url.searchParams.set("inSR", "4326");
  url.searchParams.set("spatialRel", "esriSpatialRelIntersects");
  url.searchParams.set("distance", String(distanceMeters));
  url.searchParams.set("units", "esriSRUnit_Meter");
  url.searchParams.set("outFields", outFields);
  url.searchParams.set("returnGeometry", "false");
  url.searchParams.set("f", "json");
  return url.toString();
}

async function queryArcFirst(
  layerQueryBase: string,
  lng: number,
  lat: number,
  outFields = "*",
  distanceMeters = 25,
) {
  const data = (await fetchJson(
    arcPointQueryUrl(layerQueryBase, lng, lat, outFields, distanceMeters),
  )) as { features?: ArcFeature[]; error?: unknown } | null;
  if (!data || data.error) return null;
  return data.features?.[0]?.attributes ?? null;
}

async function enrichVancouver(lng: number, lat: number): Promise<MetroOpenData | null> {
  const point = `POINT(${lng} ${lat})`;
  const zoningUrl =
    `https://opendata.vancouver.ca/api/explore/v2.1/catalog/datasets/zoning-districts-and-labels/records` +
    `?limit=1&where=${encodeURIComponent(`intersects(geom, geom'${point}')`)}`;
  const parcelUrl =
    `https://opendata.vancouver.ca/api/explore/v2.1/catalog/datasets/property-parcel-polygons/records` +
    `?limit=1&where=${encodeURIComponent(`intersects(geom, geom'${point}')`)}`;

  const [zoning, parcel] = await Promise.all([
    fetchJson(zoningUrl) as Promise<{ results?: Record<string, unknown>[] } | null>,
    fetchJson(parcelUrl) as Promise<{ results?: Record<string, unknown>[] } | null>,
  ]);

  const z = zoning?.results?.[0];
  const p = parcel?.results?.[0];
  if (!z && !p) return null;

  return {
    city: "Vancouver",
    source: "City of Vancouver Open Data",
    zoningCode: String(z?.zoning_district ?? z?.zoning_category ?? ""),
    zoningLabel: String(z?.zoning_classification ?? ""),
    zoningCategory: String(z?.zoning_category ?? ""),
    parcelAddress: [p?.civic_number, p?.streetname].filter(Boolean).join(" ") || undefined,
    notes: [
      z?.cd_1_number ? `CD-1 #${z.cd_1_number}` : undefined,
      p?.tax_coord ? `Tax coord ${p.tax_coord}` : undefined,
      p?.site_id ? `Site ID ${p.site_id}` : undefined,
    ].filter(Boolean) as string[],
  };
}

async function enrichCoquitlam(lng: number, lat: number): Promise<MetroOpenData | null> {
  const [zoning, parcel, covenant, easement] = await Promise.all([
    queryArcFirst(
      "https://geodata.coquitlam.ca/arcgis/rest/services/DynamicServices/Planning/MapServer/1/query",
      lng,
      lat,
      "ZONING,DESCRIPTION",
    ),
    queryArcFirst(
      "https://geodata.coquitlam.ca/arcgis/rest/services/DynamicServices/Cadastral/MapServer/15/query",
      lng,
      lat,
      "ADDRESS,PROPPLAN,PROPLOT,LEGALDESC,ROLL_NUMBER,PID,PROPPOSTAL",
      40,
    ),
    queryArcFirst(
      "https://geodata.coquitlam.ca/arcgis/rest/services/DynamicServices/Cadastral/MapServer/12/query",
      lng,
      lat,
      "OBJECTID",
      20,
    ),
    queryArcFirst(
      "https://geodata.coquitlam.ca/arcgis/rest/services/DynamicServices/Cadastral/MapServer/13/query",
      lng,
      lat,
      "OBJECTID",
      20,
    ),
  ]);

  if (!zoning && !parcel) return null;

  return {
    city: "Coquitlam",
    source: "City of Coquitlam Open GIS",
    zoningCode: String(zoning?.ZONING ?? ""),
    zoningLabel: String(zoning?.DESCRIPTION ?? ""),
    parcelAddress: String(parcel?.ADDRESS ?? "") || undefined,
    planNumber: String(parcel?.PROPPLAN ?? "") || undefined,
    lotNumber: String(parcel?.PROPLOT ?? "") || undefined,
    pid: String(parcel?.PID ?? "") || undefined,
    rollNumber: String(parcel?.ROLL_NUMBER ?? "") || undefined,
    legalDescription: String(parcel?.LEGALDESC ?? "") || undefined,
    hasCovenantHint: Boolean(covenant),
    hasEasementHint: Boolean(easement),
  };
}

async function enrichBurnaby(lng: number, lat: number): Promise<MetroOpenData | null> {
  const zoning = await queryArcFirst(
    "https://gis.burnaby.ca/arcgis/rest/services/BurnabyMap/BBY_PUBLIC_TOC/MapServer/42/query",
    lng,
    lat,
    "ZONECODE,CD_ZONE,OVERLAY_ZONE",
  );
  if (!zoning) return null;
  return {
    city: "Burnaby",
    source: "City of Burnaby Open GIS",
    zoningCode: String(zoning.ZONECODE ?? ""),
    zoningLabel: String(zoning.CD_ZONE || zoning.OVERLAY_ZONE || zoning.ZONECODE || ""),
    notes: [
      zoning.CD_ZONE ? `CD ${zoning.CD_ZONE}` : undefined,
      zoning.OVERLAY_ZONE ? `Overlay ${zoning.OVERLAY_ZONE}` : undefined,
    ].filter(Boolean) as string[],
  };
}

async function enrichSurrey(lng: number, lat: number): Promise<MetroOpenData | null> {
  const zoning = await queryArcFirst(
    "https://gisservices.surrey.ca/arcgis/rest/services/Public/Planning/MapServer/18/query",
    lng,
    lat,
    "ZONING,ZONING_TEXT,WEBLINK",
  );
  if (!zoning) return null;
  return {
    city: "Surrey",
    source: "City of Surrey Open GIS",
    zoningCode: String(zoning.ZONING_TEXT ?? ""),
    zoningLabel: String(zoning.ZONING ?? ""),
    notes: zoning.WEBLINK ? [`Zoning bylaw: ${zoning.WEBLINK}`] : [],
  };
}

async function enrichNorthVancouverDistrict(
  lng: number,
  lat: number,
): Promise<MetroOpenData | null> {
  const zoning = await queryArcFirst(
    "https://geoweb.dnv.org/arcgis/rest/services/Data_DynamicLayers_Zoning/MapServer/0/query",
    lng,
    lat,
    "*",
  );
  if (!zoning) return null;
  const code = String(zoning.Zoning ?? zoning.ZONING ?? zoning.ZONE ?? "");
  if (!code) return null;
  return {
    city: "North Vancouver (District)",
    source: "District of North Vancouver Open GIS",
    zoningCode: code,
    zoningLabel: code,
  };
}

export async function enrichMetroOpenData(
  city: string | undefined,
  lng?: number,
  lat?: number,
): Promise<MetroOpenData | null> {
  if (lng == null || lat == null || !Number.isFinite(lng) || !Number.isFinite(lat)) {
    return null;
  }

  const key = normalizeCity(city);

  try {
    if (key.includes("vancouver") && !key.includes("north")) {
      return await enrichVancouver(lng, lat);
    }
    if (key.includes("coquitlam") && !key.includes("port")) {
      return await enrichCoquitlam(lng, lat);
    }
    if (key.includes("burnaby")) {
      return await enrichBurnaby(lng, lat);
    }
    if (key.includes("surrey")) {
      return await enrichSurrey(lng, lat);
    }
    if (key.includes("north vancouver")) {
      return await enrichNorthVancouverDistrict(lng, lat);
    }

    // Fallback: try major layers by proximity order for ambiguous Metro Van points
    const attempts = [
      enrichVancouver,
      enrichCoquitlam,
      enrichBurnaby,
      enrichSurrey,
      enrichNorthVancouverDistrict,
    ];
    for (const fn of attempts) {
      const hit = await fn(lng, lat);
      if (hit?.zoningCode || hit?.pid || hit?.parcelAddress) return hit;
    }
  } catch {
    return null;
  }

  return null;
}
