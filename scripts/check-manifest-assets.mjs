#!/usr/bin/env node
/**
 * Fail if the web manifest or index.html points at local assets that are
 * missing, or if a PNG icon's real dimensions do not match its declared
 * `sizes`. Also fail a project-Pages footgun: start_url "/" on a
 * username.github.io/repo site.
 *
 * Run from the directory that contains index.html and the manifest
 * (the gh-pages tree today; main after the recommended branch redesign).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = process.argv[2]
  ? resolve(process.argv[2])
  : process.cwd();

const errors = [];
function fail(msg) { errors.push(msg); }

function readPngSize(filePath) {
  const buf = readFileSync(filePath);
  if (buf.length < 24 || buf[0] !== 0x89 || buf.toString('ascii', 1, 4) !== 'PNG') {
    throw new Error(`${filePath} is not a PNG`);
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const manifestPath = join(root, 'time-alloc-manifest.json');
if (!existsSync(manifestPath)) {
  fail(`missing manifest: ${manifestPath}`);
} else {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.start_url === '/' ) {
    fail('manifest start_url is "/". For a project GitHub Pages site (user.github.io/repo/) this leaves the installed app at the user root. Use "." or "./".');
  }
  for (const icon of manifest.icons || []) {
    const src = icon.src;
    if (!src || src.startsWith('data:') || /^https?:/i.test(src)) continue;
    const filePath = join(root, src);
    if (!existsSync(filePath)) {
      fail(`manifest icon src "${src}" does not exist in ${root}`);
      continue;
    }
    if (icon.sizes && icon.sizes.includes('x') && filePath.endsWith('.png')) {
      const [w, h] = icon.sizes.split('x').map(Number);
      const actual = readPngSize(filePath);
      if (actual.width !== w || actual.height !== h) {
        fail(`manifest icon ${src} declares sizes ${icon.sizes} but the PNG is ${actual.width}x${actual.height}`);
      }
    }
  }
}

const htmlPath = join(root, 'index.html');
if (!existsSync(htmlPath)) {
  fail(`missing index.html: ${htmlPath}`);
} else {
  const html = readFileSync(htmlPath, 'utf8');
  const re = /<link\b[^>]*\brel=["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const rel = m[1];
    const hrefMatch = tag.match(/\bhref=["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    const href = hrefMatch[1];
    if (!href || href.startsWith('data:') || /^https?:/i.test(href) || href.startsWith('#')) continue;
    const filePath = join(root, href);
    if (!existsSync(filePath)) {
      fail(`index.html <link rel="${rel}"> href="${href}" does not exist in ${root}`);
    } else if (/\bapple-touch-icon\b/i.test(rel) && href.endsWith('.png')) {
      const sizesMatch = tag.match(/\bsizes=["'](\d+)x(\d+)["']/i);
      if (sizesMatch) {
        const actual = readPngSize(filePath);
        const w = Number(sizesMatch[1]);
        const h = Number(sizesMatch[2]);
        if (actual.width !== w || actual.height !== h) {
          fail(`apple-touch-icon ${href} declares sizes ${w}x${h} but the PNG is ${actual.width}x${actual.height}`);
        }
      }
    }
  }
}

if (errors.length) {
  console.error('check-manifest-assets failed:');
  for (const e of errors) console.error('  -', e);
  process.exit(1);
}
console.log('check-manifest-assets: ok');
