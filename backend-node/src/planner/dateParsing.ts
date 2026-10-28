/** Deterministic extraction of common relative date phrases - mirrors
 * app.planner.date_parsing in the Python sibling backend. Returns
 * [null, null] when nothing recognized rather than guessing a range.
 */
function pad(n: number): string {
  return n.toString().padStart(2, "0");
}
function fmt(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}
function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}
function monthBounds(year: number, month: number): [string, string] {
  return [fmt(year, month, 1), fmt(year, month, lastDayOfMonth(year, month))];
}
function quarterBounds(year: number, quarter: number): [string, string] {
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  return [fmt(year, startMonth, 1), fmt(year, endMonth, lastDayOfMonth(year, endMonth))];
}

export function parseRelativeDateRange(text: string, today: Date): [string | null, string | null] {
  const lowered = text.toLowerCase();
  // UTC getters, not local - callers consistently build `today` from a
  // UTC-midnight-parsed date-only string (new Date("2026-10-28")), so
  // local getters would silently shift a day on any UTC-behind timezone
  // (most CI runners, US-based machines) even though they happen to
  // agree with UTC on this UTC+5:30 dev machine. Same class of bug as
  // the pg DATE-column timezone shift fixed in db/pgTypes.ts.
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth() + 1;

  if (lowered.includes("last month")) {
    const [year, month] = m === 1 ? [y - 1, 12] : [y, m - 1];
    return monthBounds(year, month);
  }
  if (lowered.includes("this month")) {
    return monthBounds(y, m);
  }
  if (lowered.includes("this quarter")) {
    return quarterBounds(y, Math.floor((m - 1) / 3) + 1);
  }
  if (lowered.includes("last quarter")) {
    let quarter = Math.floor((m - 1) / 3) + 1;
    let year = y;
    quarter -= 1;
    if (quarter === 0) {
      quarter = 4;
      year -= 1;
    }
    return quarterBounds(year, quarter);
  }
  if (lowered.includes("this year")) {
    return [fmt(y, 1, 1), fmt(y, 12, 31)];
  }

  const isoDates = text.match(/\d{4}-\d{2}-\d{2}/g);
  if (isoDates && isoDates.length >= 2) {
    return [isoDates[0]!, isoDates[1]!];
  }

  return [null, null];
}
