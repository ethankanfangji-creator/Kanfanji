export const SYSTEM_CARD_TEMPLATE_NAMES = [
  "第一眼與氣味",
  "採光",
  "格局與動線",
  "廚房",
  "衛浴與水壓",
  "牆面與地板",
  "收納",
  "隔音",
  "車位與儲藏",
  "周邊",
  "整體感覺",
] as const;

export type CardTemplate = {
  id: string;
  name: string;
  icon: string | null;
  sortOrder: number;
  isSystem: boolean;
};

const NAME_MAX = 40;

export function templateName(value: string): string | null {
  const name = value.replace(/\s+/g, " ").trim();
  if (!name || name.length > NAME_MAX) return null;
  return name;
}

export function oneEmoji(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parts = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(trimmed)].map(
    (part) => part.segment,
  );
  if (parts.length !== 1) return null;
  if (!/\p{Extended_Pictographic}/u.test(parts[0])) return null;
  return parts[0];
}
