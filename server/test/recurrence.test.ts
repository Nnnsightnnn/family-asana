import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeNextDue,
  describeRule,
  parseRule,
  stringifyRule,
} from '../src/recurrence.js';

const DAY = 86_400_000;

function date(y: number, m: number, d: number): number {
  // Local-noon timestamps mirror what the web client sends to dodge tz drift.
  return new Date(y, m - 1, d, 12).getTime();
}

test('parseRule round-trips and rejects garbage', () => {
  assert.deepEqual(parseRule(stringifyRule({ kind: 'daily' })), { kind: 'daily' });
  assert.deepEqual(parseRule(stringifyRule({ kind: 'every', n: 14, unit: 'day' })), {
    kind: 'every',
    n: 14,
    unit: 'day',
  });
  assert.equal(parseRule(null), null);
  assert.equal(parseRule(''), null);
  assert.equal(parseRule('not json'), null);
  assert.equal(parseRule('{"kind":"hourly"}'), null);
  assert.equal(parseRule('{"kind":"every","n":-3,"unit":"day"}'), null);
});

test('daily advances by one day', () => {
  const prev = date(2026, 5, 11); // Monday
  const next = computeNextDue({ kind: 'daily' }, prev, date(2026, 5, 11));
  assert.equal(next, date(2026, 5, 12));
});

test('weekly advances by 7 days', () => {
  const prev = date(2026, 5, 11);
  const next = computeNextDue({ kind: 'weekly' }, prev, date(2026, 5, 11));
  assert.equal(next, date(2026, 5, 18));
});

test('weekdays skips Saturday and Sunday', () => {
  const friday = date(2026, 5, 15); // 2026-05-15 is a Friday
  const next = computeNextDue({ kind: 'weekdays' }, friday, friday);
  // Next weekday after Friday is Monday
  assert.equal(next, date(2026, 5, 18));
});

test('monthly clamps to short months', () => {
  const jan31 = date(2026, 1, 31);
  const next = computeNextDue({ kind: 'monthly' }, jan31, jan31);
  // 2026 is not a leap year — Feb 28
  assert.equal(next, date(2026, 2, 28));
});

test('yearly handles Feb 29 leap years', () => {
  const feb29_2024 = date(2024, 2, 29);
  const next = computeNextDue({ kind: 'yearly' }, feb29_2024, feb29_2024);
  // 2025 is not a leap year — clamps to Feb 28
  assert.equal(next, date(2025, 2, 28));
});

test('every:N advances by N days', () => {
  const prev = date(2026, 5, 11);
  const next = computeNextDue({ kind: 'every', n: 14, unit: 'day' }, prev, prev);
  assert.equal(next, date(2026, 5, 25));
});

test('catches up past long-overdue tasks', () => {
  // Trash was due Monday Jan 5. Today is Wednesday Mar 11. Next due should be
  // the upcoming Monday (Mar 16), not Jan 12.
  const prev = date(2026, 1, 5); // Mon
  const today = date(2026, 3, 11); // Wed
  const next = computeNextDue({ kind: 'weekly' }, prev, today);
  assert.equal(next, date(2026, 3, 16)); // next Mon
  assert.ok(next > today, 'next due is in the future');
});

test('same-day due-date is treated as in the future (no extra step)', () => {
  // If the user marks a daily task done on the morning of its due date,
  // the next instance should be tomorrow — not today.
  const today = date(2026, 5, 11);
  const next = computeNextDue({ kind: 'daily' }, today, today);
  assert.equal(next, date(2026, 5, 12));
});

test('describeRule produces human-friendly labels', () => {
  assert.equal(describeRule({ kind: 'daily' }), 'Daily');
  assert.equal(describeRule({ kind: 'weekdays' }), 'Weekdays');
  assert.equal(describeRule({ kind: 'every', n: 14, unit: 'day' }), 'Every 14 days');
});
