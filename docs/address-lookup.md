# Address suggest and lookup

Keys stay on the server (`GOOGLE_MAPS_API_KEY`). Do not expose them as `NEXT_PUBLIC_*`.

## Suggest (`GET /api/address-suggest`)

Canada and untagged open-house queries use **Places API (New)** Autocomplete, biased to Metro Vancouver (`49.28, -122.91`, 45 km) with `includedRegionCodes: ["ca"]`. Lat/lng come from **Place Details** on the same `place_id`. Non-BC rows are dropped. If the key is missing, Photon is the fallback. Nominatim is not the autocomplete for this path.

Enable **Places API (New)** on the Google Cloud key (Autocomplete + Place Details). The previous Places Autocomplete JSON API is only used for the Taiwan ranking path.

## Lookup (`POST /api/lookup-address`)

| Body | When |
| --- | --- |
| `{ placeId, lat?, lng? }` | User picked a Google suggestion. Details for that id — not a new text search. |
| `{ osmId, lat?, lng? }` | User picked a Photon row. Reverse the coordinates, or Nominatim lookup by osm id if coordinates are absent. |
| `{ lat, lng }` | Device or photo GPS. |
| `{ address, freeText: true }` | User typed an address and did **not** pick a suggestion. |

`{ address }` without `freeText: true` returns `400 address_requires_free_text`.

In-flight lookups are aborted when a newer request starts. A stale response is ignored.
