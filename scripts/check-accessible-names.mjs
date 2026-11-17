#!/usr/bin/env node
/**
 * Fail if any <input> in index.html lacks an accessible name
 * (wrapping <label>, for= label, aria-label, or aria-labelledby).
 */
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = process.argv[2] ? resolve(process.argv[2]) : process.cwd();
const html = readFileSync(join(root, 'index.html'), 'utf8');

const labelFors = new Set(
  [...html.matchAll(/<label\b[^>]*\bfor=["']([^"']+)["']/gi)].map((m) => m[1]),
);

const inputRe = /<input\b[^>]*>/gi;
const unlabeled = [];
let m;
while ((m = inputRe.exec(html))) {
  const tag = m[0];
  const id = (tag.match(/\bid=["']([^"']+)["']/i) || [])[1];
  const hasAria = /\baria-label(ledby)?=["'][^"']+["']/i.test(tag);
  // Cheap wrap check: look behind a short window for an unclosed <label>.
  const before = html.slice(Math.max(0, m.index - 500), m.index);
  const wrapped = /<label\b[^>]*>[\s\S]*$/.test(before) && !/<\/label>/.test(before.split(/<label\b/i).pop());
  if (!(id && labelFors.has(id)) && !hasAria && !wrapped) {
    unlabeled.push(tag.replace(/\s+/g, ' ').trim());
  }
}

if (unlabeled.length) {
  console.error(`check-accessible-names failed: ${unlabeled.length} unlabeled <input> element(s):`);
  for (const t of unlabeled) console.error('  -', t);
  process.exit(1);
}
console.log('check-accessible-names: ok');
