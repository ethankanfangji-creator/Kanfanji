import { resolvePropertyIdentity } from "@/lib/property-identity";

/**
 * Street + unit + city identity for duplicate viewing detection.
 * Different units at the same civic address must not collide.
 */
export function addressIdentity(address: string): string {
  const id = resolvePropertyIdentity({ address });
  if (!id.streetNormalized) return "|";
  const parts = id.streetNormalized.split(",").map((part) => part.trim());
  const street = parts[0] ?? "";
  const city = parts[1] ?? "";
  return `${street}|${id.unitKey}|${city}`;
}

export function sameViewingAddress(left: string, right: string): boolean {
  const a = addressIdentity(left);
  const b = addressIdentity(right);
  return a !== "|" && a === b;
}
