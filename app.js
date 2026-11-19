import {
  parseNonNegativeNumber,
  hoursFromHourMinute,
  allocateProportional,
  formatShare,
  hoursToMinutesSeconds,
  formatMinutesSeconds,
  batchesProduced,
} from './lib/allocate.js';

const ITEMS = ['a', 'b', 'c', 'd', 'e', 'f'];
const ITEM_NAME = {
  a: 'Item A',
  b: 'Item B',
  c: 'Item C',
  d: 'Item D',
  e: 'Item E',
  f: 'Item F',
};

function setInvalid(input, on) {
  if (!input) return;
  input.classList.toggle('invalid', on);
  if (on) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
}

function readField(input, label) {
  const parsed = parseNonNegativeNumber(input.value);
  if (!parsed.ok) {
    setInvalid(input, true);
    if (parsed.reason === 'negative') {
      return { ok: false, message: `${label} cannot be negative.` };
    }
    return { ok: false, message: `${label} must be a number.` };
  }
  const minAttr = input.getAttribute('min');
  const maxAttr = input.getAttribute('max');
  if (minAttr !== null && minAttr !== '' && parsed.value < Number(minAttr)) {
    setInvalid(input, true);
    return { ok: false, message: `${label} must be at least ${minAttr}.` };
  }
  if (maxAttr !== null && maxAttr !== '' && parsed.value > Number(maxAttr)) {
    setInvalid(input, true);
    return { ok: false, message: `${label} must be at most ${maxAttr}.` };
  }
  setInvalid(input, false);
  return { ok: true, value: parsed.value };
}

function readHourMinute(hInput, mInput, label) {
  const errors = [];
  const hours = readField(hInput, `${label} hours`);
  // Minutes get an explicit 0–59 check from hoursFromHourMinute as well as max="59".
  const minutes = readField(mInput, `${label} minutes`);
  if (!hours.ok) errors.push(hours.message);
  if (!minutes.ok) errors.push(minutes.message);
  if (!hours.ok || !minutes.ok) return { ok: false, errors };
  const combined = hoursFromHourMinute(hInput.value, mInput.value);
  if (!combined.ok) {
    setInvalid(mInput, true);
    const message =
      combined.reason === 'minutes-out-of-range'
        ? `${label} minutes must be between 0 and 59.`
        : `${label} is not a valid time.`;
    return { ok: false, errors: [message] };
  }
  return { ok: true, value: combined.value, errors: [] };
}

function renderErrors(region, messages) {
  region.replaceChildren();
  if (messages.length === 0) {
    region.hidden = true;
    return;
  }
  region.hidden = false;
  const list = document.createElement('ul');
  for (const message of messages) {
    const item = document.createElement('li');
    item.textContent = message;
    list.appendChild(item);
  }
  region.appendChild(list);
}

function writeShares(nodes, shares) {
  ITEMS.forEach((key, i) => {
    const value = formatShare(shares[i]);
    const el = nodes[key];
    el.textContent = value;
    el.classList.remove('updated');
    void el.offsetWidth;
    el.classList.add('updated');
  });
}

function flash(el, text) {
  el.textContent = text;
  el.classList.remove('updated');
  void el.offsetWidth;
  el.classList.add('updated');
}

/** Seconds as "M min S s", rounded to the nearest second. */
function formatSeconds(seconds) {
  return formatMinutesSeconds(hoursToMinutesSeconds(seconds / 3600));
}

function readQuantity(input, label) {
  // Blank means one per batch, so the section works without touching Qty.
  if (input.value.trim() === '') {
    setInvalid(input, false);
    return { ok: true, value: 1 };
  }
  const result = readField(input, label);
  if (!result.ok) return result;
  if (!Number.isInteger(result.value)) {
    setInvalid(input, true);
    return { ok: false, message: `${label} must be a whole number.` };
  }
  return result;
}

function zeroShares(count) {
  return Array.from({ length: count }, () => 0);
}

document.addEventListener('DOMContentLoaded', () => {
  const shareInputs = {
    t1h: document.getElementById('total1-h'),
    t1m: document.getElementById('total1-m'),
    t2h: document.getElementById('total2-h'),
    t2m: document.getElementById('total2-m'),
  };
  const individualInputs = Object.fromEntries(
    ITEMS.map((key) => [
      key,
      {
        h: document.getElementById(`ind-${key}-h`),
        m: document.getElementById(`ind-${key}-m`),
      },
    ]),
  );
  const shareOutputs = Object.fromEntries(
    ITEMS.map((key) => [
      key,
      {
        t1: document.getElementById(`out-${key}-1`),
        t2: document.getElementById(`out-${key}-2`),
      },
    ]),
  );
  const shareErrorRegion = document.getElementById('share-errors');

  const allocSecInputs = Object.fromEntries(
    ITEMS.map((key) => [key, document.getElementById(`alloc-${key}-sec`)]),
  );
  const allocHoursInput = document.getElementById('alloc-hours');
  const allocOutputs = Object.fromEntries(
    ITEMS.map((key) => [key, document.getElementById(`alloc-${key}`)]),
  );
  const allocErrorRegion = document.getElementById('alloc-errors');
  const allocQtyInputs = Object.fromEntries(
    ITEMS.map((key) => [key, document.getElementById(`alloc-${key}-qty`)]),
  );
  const countOutputs = Object.fromEntries(
    ITEMS.map((key) => [key, document.getElementById(`count-${key}`)]),
  );
  const countBatches = document.getElementById('count-batches');
  const countBatchTime = document.getElementById('count-batch-time');
  const countLeftover = document.getElementById('count-leftover');

  const convertInput = document.getElementById('convert-hours');
  const convertOutput = document.getElementById('convert-out');
  const convertErrorRegion = document.getElementById('convert-errors');

  const calculateShare = () => {
    const errors = [];
    const t1 = readHourMinute(shareInputs.t1h, shareInputs.t1m, 'Overall Time 1');
    const t2 = readHourMinute(shareInputs.t2h, shareInputs.t2m, 'Overall Time 2');
    if (!t1.ok) errors.push(...t1.errors);
    if (!t2.ok) errors.push(...t2.errors);

    const weights = [];
    for (const key of ITEMS) {
      const item = readHourMinute(
        individualInputs[key].h,
        individualInputs[key].m,
        ITEM_NAME[key],
      );
      if (!item.ok) {
        errors.push(...item.errors);
        weights.push(0);
      } else {
        weights.push(item.value);
      }
    }

    renderErrors(shareErrorRegion, errors);
    const t1Shares = errors.length ? zeroShares(ITEMS.length) : allocateProportional(weights, t1.value);
    const t2Shares = errors.length ? zeroShares(ITEMS.length) : allocateProportional(weights, t2.value);
    ITEMS.forEach((key, i) => {
      shareOutputs[key].t1.textContent = formatShare(t1Shares[i]);
      shareOutputs[key].t2.textContent = formatShare(t2Shares[i]);
      [shareOutputs[key].t1, shareOutputs[key].t2].forEach((el) => {
        el.classList.remove('updated');
        void el.offsetWidth;
        el.classList.add('updated');
      });
    });
  };

  const calculateAlloc = () => {
    const errors = [];
    const secs = [];
    const qtys = [];
    for (const key of ITEMS) {
      const sec = readField(allocSecInputs[key], `${ITEM_NAME[key]} production time`);
      if (!sec.ok) errors.push(sec.message);
      secs.push(sec.ok ? sec.value : 0);
      const qty = readQuantity(allocQtyInputs[key], `${ITEM_NAME[key]} quantity per batch`);
      if (!qty.ok) errors.push(qty.message);
      qtys.push(qty.ok ? qty.value : 0);
    }
    const total = readField(allocHoursInput, 'Total hours');
    if (!total.ok) errors.push(total.message);

    renderErrors(allocErrorRegion, errors);
    // Each item's weight is its time per batch, so Hours Allocated and
    // Items Produced follow the same proportions.
    const weights = secs.map((sec, i) => sec * qtys[i]);
    const shares = errors.length
      ? zeroShares(ITEMS.length)
      : allocateProportional(weights, total.value);
    writeShares(allocOutputs, shares);

    const produced = errors.length
      ? batchesProduced(ITEMS.map(() => 0), ITEMS.map(() => 0), 0)
      : batchesProduced(secs, qtys, total.value);
    ITEMS.forEach((key, i) => flash(countOutputs[key], String(produced.counts[i])));
    flash(countBatches, String(produced.batches));
    flash(countBatchTime, formatSeconds(produced.batchSeconds));
    flash(countLeftover, formatSeconds(produced.leftoverSeconds));
  };

  const calculateConvert = () => {
    const hours = readField(convertInput, 'Hours');
    renderErrors(convertErrorRegion, hours.ok ? [] : [hours.message]);
    const text = hours.ok
      ? formatMinutesSeconds(hoursToMinutesSeconds(hours.value))
      : formatMinutesSeconds({ minutes: 0, seconds: 0 });
    flash(convertOutput, text);
  };

  const shareAllInputs = [
    ...Object.values(shareInputs),
    ...Object.values(individualInputs).flatMap((obj) => [obj.h, obj.m]),
  ];
  shareAllInputs.forEach((input) => {
    input.addEventListener('input', calculateShare);
    input.addEventListener('change', calculateShare);
  });
  const allocAllInputs = [
    ...Object.values(allocSecInputs),
    ...Object.values(allocQtyInputs),
    allocHoursInput,
  ];
  allocAllInputs.forEach((input) => {
    input.addEventListener('input', calculateAlloc);
    input.addEventListener('change', calculateAlloc);
  });

  convertInput.addEventListener('input', calculateConvert);
  convertInput.addEventListener('change', calculateConvert);

  calculateShare();
  calculateAlloc();
  calculateConvert();
});
