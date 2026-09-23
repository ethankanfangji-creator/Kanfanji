/**
 * Currency and area unit helpers for US / CA / TW markets.
 */

export type AreaUnit = "sqft" | "sqm" | "ping";

const SQFT_PER_SQM = 10.76391041671;
const PING_PER_SQM = 0.3025;

export function convertArea(
  value: number,
  from: AreaUnit,
  to: AreaUnit,
): number {
  if (!Number.isFinite(value) || from === to) return value;
  const sqm =
    from === "sqm"
      ? value
      : from === "sqft"
        ? value / SQFT_PER_SQM
        : value / PING_PER_SQM;
  if (to === "sqm") return round4(sqm);
  if (to === "sqft") return round4(sqm * SQFT_PER_SQM);
  return round4(sqm * PING_PER_SQM);
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

export type CurrencyCode = "USD" | "CAD" | "TWD" | "EUR" | "GBP";

const FX_TO_USD: Record<CurrencyCode, number> = {
  USD: 1,
  CAD: 0.74,
  TWD: 0.031,
  EUR: 1.08,
  GBP: 1.27,
};

/**
 * Rough FX for display/compare only — always mark as estimate.
 * Rates are illustrative placeholders, not live market data.
 */
export function convertCurrencyApprox(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
): { amount: number; assumption: string } {
  if (!Number.isFinite(amount) || from === to) {
    return {
      amount,
      assumption: "same_currency",
    };
  }
  const usd = amount * FX_TO_USD[from];
  const out = usd / FX_TO_USD[to];
  return {
    amount: Math.round(out * 100) / 100,
    assumption: `illustrative_fx_${from}_to_${to}_not_live`,
  };
}

export function detectCurrencyFromText(text: string): CurrencyCode | null {
  const t = text.toUpperCase();
  if (/TWD|NT\$|新台幣|台幣/.test(text) || /NT\$/.test(t)) return "TWD";
  if (/CAD|C\$|CA\$/.test(t)) return "CAD";
  if (/USD|US\$/.test(t) || /\$/.test(text)) return "USD";
  if (/€|EUR/.test(t)) return "EUR";
  if (/£|GBP/.test(t)) return "GBP";
  return null;
}

export function detectAreaUnitFromText(text: string): AreaUnit | null {
  if (/坪|ping/i.test(text)) return "ping";
  if (/m²|sq\.?\s*m|平方米|平方公尺/i.test(text)) return "sqm";
  if (/sq\.?\s*ft|sqft|ft²|平方英尺/i.test(text)) return "sqft";
  return null;
}

export function parseLooseNumber(text: string): number | null {
  const cleaned = text.replace(/[,，\s]/g, "").match(/-?\d+(\.\d+)?/);
  if (!cleaned) return null;
  const n = Number(cleaned[0]);
  return Number.isFinite(n) ? n : null;
}
