import { NextResponse } from "next/server";
import {
  buildGoogleStaticMapUrl,
  parseMapCoverQuery,
} from "@/lib/map/google-static";

export const runtime = "nodejs";

/**
 * GET /api/map/static?lat=&lng=&w=&h=&z=
 * Proxies Google Static Maps so the browser never sees GOOGLE_MAPS_API_KEY.
 * Public (share pages are anonymous).
 */
export async function GET(request: Request) {
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!key) {
    return NextResponse.json({ error: "MAP_UNAVAILABLE" }, { status: 503 });
  }

  const parsed = parseMapCoverQuery(new URL(request.url).searchParams);
  if (!parsed) {
    return NextResponse.json({ error: "INVALID_COORDS" }, { status: 400 });
  }

  const upstream = buildGoogleStaticMapUrl({
    ...parsed,
    apiKey: key,
    scale: 2,
  });

  try {
    const response = await fetch(upstream, {
      headers: { Accept: "image/*" },
      cache: "force-cache",
      next: { revalidate: 86_400 },
    });
    if (!response.ok) {
      return NextResponse.json(
        { error: "MAP_UPSTREAM", status: response.status },
        { status: 502 },
      );
    }
    const contentType = response.headers.get("content-type") || "image/png";
    if (!contentType.startsWith("image/")) {
      return NextResponse.json({ error: "MAP_UPSTREAM" }, { status: 502 });
    }
    const bytes = await response.arrayBuffer();
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    return NextResponse.json({ error: "MAP_UPSTREAM" }, { status: 502 });
  }
}
