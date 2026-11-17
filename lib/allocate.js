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
