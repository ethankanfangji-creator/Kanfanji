import { enrichAttomProperty } from "@/lib/property-intel/market-attom";
import { gateProvider } from "../providers/registry";
import type { ProviderAudit } from "../providers/types";
import type { PropertyRegion } from "../types";

type AttomResult = Awaited<ReturnType<typeof enrichAttomProperty>>;

const memo = new Map<string, Promise<AttomResult>>();

const EMPTY: AttomResult = { basic: {}, history: {}, market: {}, sources: [] };

/** Request-scoped ATTOM fetch — gated by licensed provider registry. */
export function fetchAttomOnce(
  address: string,
  opts?: { region?: PropertyRegion; audit?: ProviderAudit },
): Promise<AttomResult> {
  if (!gateProvider("attom", { region: opts?.region ?? "US", audit: opts?.audit })) {
    return Promise.resolve(EMPTY);
  }

  const key = address.trim().toLowerCase();
  if (!key) {
    return Promise.resolve(EMPTY);
  }
  let pending = memo.get(key);
  if (!pending) {
    pending = enrichAttomProperty(address).finally(() => {
      setTimeout(() => memo.delete(key), 5_000);
    });
    memo.set(key, pending);
  }
  return pending;
}
