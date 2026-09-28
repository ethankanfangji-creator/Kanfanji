/**
 * Pro weeks start Monday 00:00 at a fixed UTC offset.
 * British Columbia has been on permanent UTC-7 since 2026-03-08 (tzdata 2026b).
 * Node's built-in ICU may still treat November as PST (UTC-8), so this must not
 * use Intl or America/Vancouver. If the rule changes, set AI_PRO_WEEK_UTC_OFFSET_MINUTES.
 */

const DEFAULT_OFFSET_MINUTES = -420;

function offsetMinutes(): number {
  const parsed = Number(process.env.AI_PRO_WEEK_UTC_OFFSET_MINUTES ?? DEFAULT_OFFSET_MINUTES);
  return Number.isFinite(parsed) ? parsed : DEFAULT_OFFSET_MINUTES;
}

function dateKey(time: number): string {
  const date = new Date(time);
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}-${day}`;
}

export function proWeekWindow(now: Date): { weekKey: string; startsAt: Date; resetsAt: Date } {
  const offsetMs = offsetMinutes() * 60_000;
  const shifted = new Date(now.getTime() + offsetMs);
  const daysSinceMonday = (shifted.getUTCDay() + 6) % 7;
  const mondayUtc = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() - daysSinceMonday,
  );
  const startsAt = new Date(mondayUtc - offsetMs);
  return {
    weekKey: dateKey(mondayUtc),
    startsAt,
    resetsAt: new Date(startsAt.getTime() + 7 * 86_400_000),
  };
}
