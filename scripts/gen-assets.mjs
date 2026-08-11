#!/usr/bin/env node
/**
 * Generates static brand assets into public/ from two sources:
 *   - public/favicon.svg  → PNG icon sizes + favicon.ico
 *   - a strong R2 photo   → og.jpg (1200×630 social share card w/ title overlay)
 *
 * Run manually when the favicon or OG source changes:
 *   node scripts/gen-assets.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const pub = (p) => resolve(ROOT, 'public', p);

// Photo used for the OG card (landscape, striking). Served from R2.
const OG_SOURCE = 'https://img.curtiskline.com/photos/burning-man/2025/dsc-0128-e5e81638.jpg';

async function icons() {
  const svg = await readFile(pub('favicon.svg'));
  const png = (size) => sharp(svg, { density: 384 }).resize(size, size).png();

  await png(180).toFile(pub('apple-touch-icon.png'));
  await png(192).toFile(pub('icon-192.png'));
  await png(512).toFile(pub('icon-512.png'));

  const ico32 = await png(32).toBuffer();
  const ico16 = await sharp(svg, { density: 384 }).resize(16, 16).png().toBuffer();
  await writeFile(pub('favicon.ico'), await pngToIco([ico16, ico32]));
  console.log('✓ icons: apple-touch-icon.png, icon-192.png, icon-512.png, favicon.ico');
}

async function ogImage() {
  const res = await fetch(OG_SOURCE);
  if (!res.ok) throw new Error(`OG source fetch failed: ${res.status}`);
  const src = Buffer.from(await res.arrayBuffer());

  const W = 1200;
  const H = 630;
  const base = await sharp(src).resize(W, H, { fit: 'cover', position: 'attention' }).toBuffer();

  // Bottom gradient + title, composited as an SVG overlay.
  const overlay = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.45" stop-color="#000" stop-opacity="0"/>
          <stop offset="1" stop-color="#000" stop-opacity="0.72"/>
        </linearGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#g)"/>
      <text x="64" y="${H - 96}" fill="#fff" font-family="Helvetica, Arial, sans-serif"
            font-size="64" font-weight="800" letter-spacing="2">Curtis Kline</text>
      <text x="66" y="${H - 52}" fill="#8cd1a8" font-family="Helvetica, Arial, sans-serif"
            font-size="26" font-weight="700" letter-spacing="3">CURTISKLINE.COM</text>
    </svg>`);

  await sharp(base)
    .composite([{ input: overlay, top: 0, left: 0 }])
    .jpeg({ quality: 85, mozjpeg: true })
    .toFile(pub('og.jpg'));
  console.log('✓ og.jpg (1200×630)');
}

await icons();
await ogImage();
console.log('Done.');
