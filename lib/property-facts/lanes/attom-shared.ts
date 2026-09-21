import { enrichAttomProperty } from "@/lib/property-intel/market-attom";

type AttomResult = Awaited<ReturnType<typeof enrichAttomProperty>>;

const memo = new Map<string, Promise<AttomResult>>();

/** Request-scoped ATTOM fetch (module memo cleared per address key). */
export function fetchAttomOnce(address: string): Promise<AttomResult> {
  const key = address.trim().toLowerCase();
  if (!key) {
    return Promise.resolve({ basic: {}, history: {}, market: {}, sources: [] });
  }
  let pending = memo.get(key);
  if (!pending) {
    pending = enrichAttomProperty(address).finally(() => {
      // keep warm briefly for parallel lanes in same tick
      setTimeout(() => memo.delete(key), 5_000);
    });
    memo.set(key, pending);
  }
  return pending;
}
