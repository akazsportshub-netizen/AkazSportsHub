/** Pure academy rules: no database, so they are easy to test. Dates are 'YYYY-MM-DD' venue-local days. */

export const ATTENDANCE = ['PRESENT', 'ABSENT', 'EXCUSED'] as const;
export type AttendanceStatus = (typeof ATTENDANCE)[number];

const DAY_MS = 86_400_000;

function toUtc(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(day: string, days: number): string {
  return fromUtc(toUtc(day) + days * DAY_MS);
}

/** ISO weekday: 1 = Monday ... 7 = Sunday. */
export function isoWeekday(day: string): number {
  const d = new Date(toUtc(day)).getUTCDay(); // 0 = Sunday
  return d === 0 ? 7 : d;
}

/** Every date from `from` through `to` (both included) that falls on `weekday`. */
export function sessionDates(weekday: number, from: string, to: string): string[] {
  if (toUtc(to) < toUtc(from)) return [];
  const shift = (weekday - isoWeekday(from) + 7) % 7;
  const out: string[] = [];
  for (let day = addDays(from, shift); toUtc(day) <= toUtc(to); day = addDays(day, 7)) out.push(day);
  return out;
}

/** '2026-12' becomes '2026-12-01'; anything else is null. */
export function monthStart(month: string): string | null {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  return match ? `${match[1]}-${match[2]}-01` : null;
}

/** Marks may be entered for today and earlier, never for a session that has not happened yet. */
export function attendanceProblem(sessionDate: string, today: string, cancelled: boolean): 'CANCELLED' | 'FUTURE_SESSION' | null {
  if (cancelled) return 'CANCELLED';
  return toUtc(sessionDate) > toUtc(today) ? 'FUTURE_SESSION' : null;
}

export interface AttendanceSummary {
  present: number;
  absent: number;
  excused: number;
  /** Share of sessions attended, not counting excused ones; null until there is something to count. */
  percent: number | null;
}

export function summarizeAttendance(statuses: readonly AttendanceStatus[]): AttendanceSummary {
  let present = 0;
  let absent = 0;
  let excused = 0;
  for (const status of statuses) {
    if (status === 'PRESENT') present++;
    else if (status === 'ABSENT') absent++;
    else excused++;
  }
  const counted = present + absent;
  return { present, absent, excused, percent: counted === 0 ? null : Math.round((present / counted) * 100) };
}
