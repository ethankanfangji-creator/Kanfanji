const STREET_SUFFIX: Record<string, string> = {
  street: "st",
  st: "st",
  avenue: "ave",
  ave: "ave",
  road: "rd",
  rd: "rd",
  drive: "dr",
  dr: "dr",
  boulevard: "blvd",
  blvd: "blvd",
  lane: "ln",
  ln: "ln",
  way: "way",
  court: "ct",
  ct: "ct",
  place: "pl",
  pl: "pl",
  crescent: "cres",
  cres: "cres",
};

function normalizePart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[.]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => STREET_SUFFIX[word] ?? word)
    .join(" ");
}

/** Street line plus city, ignoring case and extra spaces. */
export function addressIdentity(address: string): string {
  const parts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const street = normalizePart(parts[0] ?? "");
  const city = normalizePart(parts[1] ?? "");
  return `${street}|${city}`;
}

export function sameViewingAddress(left: string, right: string): boolean {
  const a = addressIdentity(left);
  const b = addressIdentity(right);
  return a !== "|" && a === b;
}
