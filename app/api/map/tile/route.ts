import { NextResponse } from "next/server";

export const runtime = "nodejs";

const UA =
  "KanFangJi/1.0 (https://kanfangji.app; share/list map covers; contact via site)";

/**
 * GET /api/map/tile?z=&x=&y=
 * Server-side OSM raster proxy (browser hotlinking to osm.org is blocked).
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const z = Number(params.get("z"));
  const x = Number(params.get("x"));
  const y = Number(params.get("y"));
  if (
    !Number.isInteger(z) ||
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    z < 0 ||
    z > 19 ||
    x < 0 ||
    y < 0 ||
    x >= 2 ** z ||
    y >= 2 ** z
  ) {
    return NextResponse.json({ error: "INVALID_TILE" }, { status: 400 });
  }

  const upstream = `https://a.tile.openstreetmap.fr/osmfr/${z}/${x}/${y}.png`;
  try {
    const response = await fetch(upstream, {
      headers: { "User-Agent": UA, Accept: "image/png" },
      next: { revalidate: 86_400 },
    });
    if (!response.ok) {
      return NextResponse.json({ error: "TILE_UPSTREAM" }, { status: 502 });
    }
    const bytes = await response.arrayBuffer();
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": response.headers.get("content-type") || "image/png",
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    return NextResponse.json({ error: "TILE_UPSTREAM" }, { status: 502 });
  }
}
