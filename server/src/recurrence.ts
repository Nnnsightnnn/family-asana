import { z } from 'zod';

export const RecurrenceRule = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('daily') }),
  z.object({ kind: z.literal('weekdays') }),
  z.object({ kind: z.literal('weekly') }),
  z.object({ kind: z.literal('monthly') }),
  z.object({ kind: z.literal('yearly') }),
  z.object({
    kind: z.literal('every'),
    n: z.number().int().min(1).max(365),
    unit: z.enum(['day']),
  }),
]);

export type RecurrenceRule = z.infer<typeof RecurrenceRule>;

/** Parse a stored recurrence string. Returns null for null/invalid input. */
export function parseRule(raw: string | null | undefined): RecurrenceRule | null {
  if (!raw) return null;
  try {
    const parsed = RecurrenceRule.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Stringify a rule for storage. */
export function stringifyRule(rule: RecurrenceRule): string {
  return JSON.stringify(rule);
}

const DAY_MS = 86_400_000;

/**
 * Add N calendar days while preserving local wall-clock time. ms-based math
 * (ts + N*86_400_000) drifts by ±1 hour across DST boundaries, which would
 * silently move "trash at noon Monday" to 11am or 1pm twice a year.
 */
function addDays(ts: number, days: number): number {
  const d = new Date(ts);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

function isWeekend(ts: number): boolean {
  const d = new Date(ts).getDay();
  return d === 0 || d === 6;
}

function addMonthsClamped(ts: number, months: number): number {
  // Same day-of-month next month, clamping to the last day of shorter months.
  // E.g. Jan 31 + 1 month → Feb 28/29.
  const d = new Date(ts);
  const targetMonth = d.getMonth() + months;
  const target = new Date(d);
  target.setDate(1);
  target.setMonth(targetMonth);
  const lastDayOfTargetMonth = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0
  ).getDate();
  target.setDate(Math.min(d.getDate(), lastDayOfTargetMonth));
  target.setHours(d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
  return target.getTime();
}

function addYears(ts: number, years: number): number {
  return addMonthsClamped(ts, years * 12);
}

/** One step of advancement, no catch-up logic. */
function stepOnce(rule: RecurrenceRule, from: number): number {
  switch (rule.kind) {
    case 'daily':
      return addDays(from, 1);
    case 'weekdays': {
      let next = addDays(from, 1);
      while (isWeekend(next)) next = addDays(next, 1);
      return next;
    }
    case 'weekly':
      return addDays(from, 7);
    case 'monthly':
      return addMonthsClamped(from, 1);
    case 'yearly':
      return addYears(from, 1);
    case 'every':
      return addDays(from, rule.n);
  }
}

/**
 * Compute the next due timestamp for a recurring task.
 *
 * Starts from `previousDue + cadence`, then keeps advancing while the result
 * is still in the past relative to `nowTs` — so a long-overdue trash day
 * produces *next* Monday, not five Mondays ago.
 */
export function computeNextDue(
  rule: RecurrenceRule,
  previousDue: number,
  nowTs: number = Date.now()
): number {
  let next = stepOnce(rule, previousDue);
  // Compare against today's start so a same-day due date counts as "in the future".
  const startOfToday = new Date(nowTs);
  startOfToday.setHours(0, 0, 0, 0);
  const floor = startOfToday.getTime();
  // Bail out cap — should never trigger in practice but stops a runaway loop
  // if someone hands us pathological data (e.g. yearly with previousDue = epoch).
  let safety = 10_000;
  while (next < floor && safety-- > 0) {
    next = stepOnce(rule, next);
  }
  return next;
}

/** Short human label for the picker / row badge. */
export function describeRule(rule: RecurrenceRule): string {
  switch (rule.kind) {
    case 'daily':
      return 'Daily';
    case 'weekdays':
      return 'Weekdays';
    case 'weekly':
      return 'Weekly';
    case 'monthly':
      return 'Monthly';
    case 'yearly':
      return 'Yearly';
    case 'every':
      return `Every ${rule.n} days`;
  }
}
