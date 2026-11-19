/**
 * Pure time-allocation math extracted from index.html.
 * Keep the page script as a thin DOM wrapper around these functions
 * so rounding, validation, and divide-by-zero behavior can be tested
 * without a browser.
 */

const DEFAULT_DECIMALS = 4;

/**
 * Parse a user-entered numeric field.
 * Unlike `parseFloat(value) || 0`, this rejects negatives, NaN, and non-finite
 * values instead of silently coercing them.
 *
 * Empty / whitespace is treated as 0 (blank field) when allowEmpty is true.
 */
export function parseNonNegativeNumber(value, { allowEmpty = true } = {}) {
  if (value == null) {
    return allowEmpty
      ? { ok: true, value: 0 }
      : { ok: false, value: NaN, reason: 'empty' };
  }
  const raw = String(value).trim();
  if (raw === '') {
    return allowEmpty
      ? { ok: true, value: 0 }
      : { ok: false, value: NaN, reason: 'empty' };
  }
  // Require the whole string to be a number, not parseFloat("10foo") === 10.
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(raw)) {
    return { ok: false, value: NaN, reason: 'invalid' };
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    return { ok: false, value: NaN, reason: 'invalid' };
  }
  if (n < 0) {
    return { ok: false, value: n, reason: 'negative' };
  }
  return { ok: true, value: n };
}

/**
 * Convert hours + minutes to hours.
 * Minutes must be in [0, 59]; they are not silently overflowed (90 !== 1.5h)
 * because the UI advertises a 0–59 minutes field.
 */
export function hoursFromHourMinute(hoursValue, minutesValue) {
  const hours = parseNonNegativeNumber(hoursValue);
  const minutes = parseNonNegativeNumber(minutesValue);
  if (!hours.ok) return hours;
  if (!minutes.ok) return minutes;
  if (minutes.value > 59) {
    return { ok: false, value: NaN, reason: 'minutes-out-of-range' };
  }
  return { ok: true, value: hours.value + minutes.value / 60 };
}

/**
 * Split `total` across items in proportion to `weights`.
 * Displayed values are rounded to `decimals` places and are guaranteed
 * (via the largest-remainder method) to sum to the total rounded to the
 * same number of places. Zero total or zero weight-sum yields all zeros
 * and never divides by zero.
 *
 * @param {number[]} weights
 * @param {number} total
 * @param {{decimals?: number}} [opts]
 * @returns {number[]} shares in the same order as weights
 */
export function allocateProportional(weights, total, { decimals = DEFAULT_DECIMALS } = {}) {
  if (!Array.isArray(weights)) {
    throw new TypeError('weights must be an array');
  }
  if (!Number.isFinite(decimals) || decimals < 0 || !Number.isInteger(decimals)) {
    throw new TypeError('decimals must be a non-negative integer');
  }
  const zeros = () => weights.map(() => 0);
  if (!Number.isFinite(total) || total <= 0) return zeros();
  if (weights.some((w) => !Number.isFinite(w) || w < 0)) {
    throw new RangeError('weights must be finite and non-negative');
  }
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weightSum <= 0) return zeros();

  const factor = 10 ** decimals;
  const scaledTotal = Math.round(total * factor);
  const raw = weights.map((w) => (w / weightSum) * scaledTotal);
  const floors = raw.map((x) => Math.floor(x + Number.EPSILON));
  let remainder = scaledTotal - floors.reduce((a, b) => a + b, 0);

  const order = raw
    .map((x, i) => ({ i, frac: x - floors[i] }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  const scaled = floors.slice();
  for (const { i } of order) {
    if (remainder <= 0) break;
    scaled[i] += 1;
    remainder -= 1;
  }
  return scaled.map((n) => n / factor);
}

/** Format a share already rounded by allocateProportional. */
export function formatShare(num, decimals = DEFAULT_DECIMALS) {
  return Number(num).toFixed(decimals);
}

/**
 * Convert decimal hours to whole minutes and seconds, rounded to the
 * nearest second (1.2575 h -> 75 min 27 s). Minutes are not rolled up
 * into hours: 2.5 h is 150 min 0 s.
 *
 * @param {number} hours non-negative, finite
 * @returns {{minutes: number, seconds: number, totalSeconds: number}}
 */
export function hoursToMinutesSeconds(hours) {
  if (!Number.isFinite(hours) || hours < 0) {
    throw new RangeError('hours must be finite and non-negative');
  }
  // Round via a fixed decimal string so 1.2575 * 3600 = 4526.999... rounds to 4527.
  const totalSeconds = Math.round(Number((hours * 3600).toFixed(6)));
  return {
    minutes: Math.floor(totalSeconds / 60),
    seconds: totalSeconds % 60,
    totalSeconds,
  };
}

/** "75 min 27 s" */
export function formatMinutesSeconds({ minutes, seconds }) {
  return `${minutes} min ${seconds} s`;
}

/**
 * Whole items produced when `totalHours` is filled with complete batches.
 * One batch contains `qtys[i]` of item i, each taking `secs[i]` seconds,
 * so one batch takes sum(secs[i] * qtys[i]) seconds. This is the same
 * proportionality as allocateProportional with weights secs[i] * qtys[i]:
 * item i's allocated hours divided by its seconds per item is
 * batches * qtys[i].
 *
 * Only complete batches count (rounded down); the unused time is returned
 * as leftoverSeconds. Items with no production time count 0.
 *
 * @param {number[]} secs seconds per single item, non-negative
 * @param {number[]} qtys whole items of each per batch, non-negative integers
 * @param {number} totalHours
 * @returns {{batchSeconds: number, batches: number, counts: number[], leftoverSeconds: number}}
 */
export function batchesProduced(secs, qtys, totalHours) {
  if (!Array.isArray(secs) || !Array.isArray(qtys) || secs.length !== qtys.length) {
    throw new TypeError('secs and qtys must be arrays of the same length');
  }
  if (secs.some((s) => !Number.isFinite(s) || s < 0)) {
    throw new RangeError('secs must be finite and non-negative');
  }
  if (qtys.some((q) => !Number.isInteger(q) || q < 0)) {
    throw new RangeError('qtys must be non-negative integers');
  }
  const zero = (batchSeconds = 0) => ({
    batchSeconds,
    batches: 0,
    counts: secs.map(() => 0),
    leftoverSeconds: 0,
  });
  // Clean up float noise from decimal inputs (0.1 * 3 = 0.30000000000000004).
  const clean = (x) => Number(x.toFixed(6));
  const batchSeconds = clean(secs.reduce((a, s, i) => a + s * qtys[i], 0));
  if (!Number.isFinite(totalHours) || totalHours <= 0 || batchSeconds <= 0) {
    return zero(batchSeconds);
  }
  const totalSeconds = clean(totalHours * 3600);
  const batches = Math.floor(clean(totalSeconds / batchSeconds));
  return {
    batchSeconds,
    batches,
    counts: secs.map((s, i) => (s > 0 ? batches * qtys[i] : 0)),
    leftoverSeconds: clean(totalSeconds - batches * batchSeconds),
  };
}
