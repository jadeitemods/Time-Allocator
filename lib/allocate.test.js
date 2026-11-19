import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseNonNegativeNumber,
  hoursFromHourMinute,
  allocateProportional,
  formatShare,
  hoursToMinutesSeconds,
  formatMinutesSeconds,
  batchesProduced,
} from './allocate.js';

function sum(xs) {
  // Add at the displayed precision so 0.1 + 0.2 style error is not the point.
  return xs.reduce((a, b) => a + b, 0);
}

function assertSumsTo(shares, total, decimals = 4) {
  const factor = 10 ** decimals;
  const got = Math.round(sum(shares) * factor);
  const want = Math.round(total * factor);
  assert.equal(got, want, `shares ${shares} sum to ${sum(shares)}, want ${total}`);
}

test('equal thirds of 1 hour sum to 1.0000 (pre-fix page displayed 0.9999)', () => {
  const shares = allocateProportional([1, 1, 1, 0, 0, 0], 1);
  assert.equal(shares.filter((s) => s > 0).length, 3);
  assertSumsTo(shares, 1);
  assert.deepEqual(
    shares.map((s) => formatShare(s)),
    ['0.3334', '0.3333', '0.3333', '0.0000', '0.0000', '0.0000'],
  );
});

test('equal thirds of 10 hours sum to 10.0000 (pre-fix page displayed 9.9999)', () => {
  const shares = allocateProportional([1, 1, 1], 10);
  assertSumsTo(shares, 10);
  assert.deepEqual(shares.map((s) => formatShare(s)), ['3.3334', '3.3333', '3.3333']);
});

test('equal thirds of 2 hours sum to 2.0000 (pre-fix page displayed 2.0001)', () => {
  const shares = allocateProportional([1, 1, 1], 2);
  assertSumsTo(shares, 2);
  // 2/3 = 0.6666... would become 0.6667 * 3 = 2.0001 with naive toFixed
  assert.deepEqual(shares.map((s) => formatShare(s)), ['0.6667', '0.6667', '0.6666']);
});

test('equal thirds of 0.1 hours sum to 0.1000 (pre-fix page displayed 0.0999)', () => {
  const shares = allocateProportional([1, 1, 1], 0.1);
  assertSumsTo(shares, 0.1);
});

test('exact ratios stay exact: 1:2:3 of 12 = 2,4,6', () => {
  const shares = allocateProportional([1, 2, 3], 12);
  assert.deepEqual(shares, [2, 4, 6]);
  assertSumsTo(shares, 12);
});

test('decimal weights 1.5, 1.5, 3 of 10 = 2.5, 2.5, 5', () => {
  const shares = allocateProportional([1.5, 1.5, 3], 10);
  assert.deepEqual(shares, [2.5, 2.5, 5]);
});

test('zero total or zero weights returns zeros and does not divide by zero', () => {
  assert.deepEqual(allocateProportional([1, 2, 3], 0), [0, 0, 0]);
  assert.deepEqual(allocateProportional([1, 2, 3], -8), [0, 0, 0]);
  assert.deepEqual(allocateProportional([0, 0, 0], 8), [0, 0, 0]);
  assert.deepEqual(allocateProportional([], 8), []);
});

test('negative or non-finite weights throw rather than produce negative hours', () => {
  assert.throws(() => allocateProportional([-10, 20], 10), /non-negative/);
  assert.throws(() => allocateProportional([Infinity, 1], 10), /finite/);
  assert.throws(() => allocateProportional([NaN, 1], 10), /finite/);
});

test('parseNonNegativeNumber rejects negatives, garbage, and Infinity', () => {
  assert.deepEqual(parseNonNegativeNumber(''), { ok: true, value: 0 });
  assert.deepEqual(parseNonNegativeNumber('  2.5  '), { ok: true, value: 2.5 });
  assert.equal(parseNonNegativeNumber('-10').ok, false);
  assert.equal(parseNonNegativeNumber('-10').reason, 'negative');
  assert.equal(parseNonNegativeNumber('10foo').ok, false);
  assert.equal(parseNonNegativeNumber('abc').ok, false);
  assert.equal(parseNonNegativeNumber('Infinity').ok, false);
  assert.equal(parseNonNegativeNumber('   ').ok, true);
  assert.equal(parseNonNegativeNumber('   ').value, 0);
});

test('hoursFromHourMinute converts 1h 30m to 1.5 and rejects 90 minutes', () => {
  assert.equal(hoursFromHourMinute('1', '30').value, 1.5);
  assert.equal(hoursFromHourMinute('2', '0').value, 2);
  assert.equal(hoursFromHourMinute('0', '90').ok, false);
  assert.equal(hoursFromHourMinute('0', '90').reason, 'minutes-out-of-range');
  assert.equal(hoursFromHourMinute('-1', '0').ok, false);
  assert.equal(hoursFromHourMinute('1', '-1').ok, false);
});

test('v1.0 regression: two pools are allocated separately, never added', () => {
  // Item A is the only weight; T1=2h and T2=3h stay 2 and 3, not 5.
  const t1 = allocateProportional([1, 0], 2);
  const t2 = allocateProportional([1, 0], 3);
  assert.deepEqual(t1, [2, 0]);
  assert.deepEqual(t2, [3, 0]);
  // The v1.0 bug was a single output of T1+T2 (5). The two pools must
  // stay independent even though 2+3 happens to be 5.
  assert.equal(t1[0], 2);
  assert.equal(t2[0], 3);
});

test('historical v1.2 reps formula was a constant (guard against bringing it back)', () => {
  // reps = (share * totalHoursSeconds) / secs[i] === totalHoursSeconds / totalSeconds
  // for every item with secs[i] > 0. That is not a per-item repetition count.
  const secs = [10, 20, 30];
  const totalSeconds = secs.reduce((a, b) => a + b, 0);
  const totalHoursSeconds = 2 * 3600;
  const reps = secs.map((sec) => {
    const share = sec / totalSeconds;
    return (share * totalHoursSeconds) / sec;
  });
  assert.ok(reps.every((r) => r === reps[0]));
  assert.equal(reps[0], totalHoursSeconds / totalSeconds);
  // The v1.3 replacement — allocated hours — is what we test instead:
  const hours = allocateProportional(secs, 2);
  assert.deepEqual(hours.map((s) => formatShare(s)), ['0.3333', '0.6667', '1.0000']);
  assertSumsTo(hours, 2);
});

test('hoursToMinutesSeconds: 1.2575 h is 75 min 27 s', () => {
  assert.deepEqual(hoursToMinutesSeconds(1.2575), { minutes: 75, seconds: 27, totalSeconds: 4527 });
  assert.equal(formatMinutesSeconds(hoursToMinutesSeconds(1.2575)), '75 min 27 s');
});

test('hoursToMinutesSeconds: minutes are not rolled into hours, zero is 0 min 0 s', () => {
  assert.equal(formatMinutesSeconds(hoursToMinutesSeconds(2.5)), '150 min 0 s');
  assert.equal(formatMinutesSeconds(hoursToMinutesSeconds(0)), '0 min 0 s');
  assert.equal(formatMinutesSeconds(hoursToMinutesSeconds(0.0001)), '0 min 0 s');
  assert.equal(formatMinutesSeconds(hoursToMinutesSeconds(0.0002)), '0 min 1 s');
});

test('hoursToMinutesSeconds rounds 59.6 s up into the next minute', () => {
  // 0.016555... h = 59.6 s
  assert.equal(formatMinutesSeconds(hoursToMinutesSeconds(59.6 / 3600)), '1 min 0 s');
});

test('hoursToMinutesSeconds rejects negatives and non-finite values', () => {
  assert.throws(() => hoursToMinutesSeconds(-1), RangeError);
  assert.throws(() => hoursToMinutesSeconds(Infinity), RangeError);
});

test('batchesProduced: one of each per batch gives the same count for every item', () => {
  const r = batchesProduced([30, 45, 15], [1, 1, 1], 1);
  assert.equal(r.batchSeconds, 90);
  assert.equal(r.batches, 40);
  assert.deepEqual(r.counts, [40, 40, 40]);
  assert.equal(r.leftoverSeconds, 0);
});

test('batchesProduced: only complete batches count, leftover time is reported', () => {
  const r = batchesProduced([30, 45, 15], [1, 1, 1], 1.01); // 3636 s = 40.4 batches
  assert.equal(r.batches, 40);
  assert.deepEqual(r.counts, [40, 40, 40]);
  assert.equal(r.leftoverSeconds, 36);
});

test('batchesProduced: 1 A, 2 B, 4 C per batch', () => {
  // batch = 10 + 2*20 + 4*5 = 70 s; 1 h = 3600 s = 51 batches, 30 s left
  const r = batchesProduced([10, 20, 5], [1, 2, 4], 1);
  assert.equal(r.batchSeconds, 70);
  assert.equal(r.batches, 51);
  assert.deepEqual(r.counts, [51, 102, 204]);
  assert.equal(r.leftoverSeconds, 30);
});

test('batchesProduced: exact fit with decimal inputs is not lost to float error', () => {
  // 0.1 s * 3 = 0.30000000000000004 in floats; 0.3 h / 0.3 s = 3600 batches
  const r = batchesProduced([0.1], [3], 0.3);
  assert.equal(r.batches, 3600);
  assert.equal(r.leftoverSeconds, 0);
});

test('batchesProduced: zero time, zero qty, or a too-small total gives 0 without dividing by zero', () => {
  assert.deepEqual(batchesProduced([0, 0], [1, 1], 1).counts, [0, 0]);
  assert.deepEqual(batchesProduced([30, 30], [0, 0], 1).counts, [0, 0]);
  assert.deepEqual(batchesProduced([30, 30], [1, 1], 0).counts, [0, 0]);
  const tooShort = batchesProduced([3600], [2], 1);
  assert.equal(tooShort.batches, 0);
  assert.deepEqual(tooShort.counts, [0]);
});

test('batchesProduced: an item with qty but no time counts 0, not batches', () => {
  const r = batchesProduced([60, 0], [1, 1], 1);
  assert.deepEqual(r.counts, [60, 0]);
});

test('batchesProduced rejects fractional or negative quantities', () => {
  assert.throws(() => batchesProduced([10], [1.5], 1), RangeError);
  assert.throws(() => batchesProduced([10], [-1], 1), RangeError);
});
