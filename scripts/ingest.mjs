#!/usr/bin/env node
/**
 * Local photo ingest CLI. Runs on Curtis's machine, never in CI.
 *
 *   node scripts/ingest.mjs --section burning-man --dir ~/Pictures/brc2019 [--dry-run]
 *
 * Per file: read dimensions + dominant color (sharp), read EXIF date/camera/lens
 * (exifr), auto-orient and STRIP ALL METADATA (incl. GPS) while downscaling to a
 * <=4000px long edge, derive a stable content-hashed id, upload the stripped
 * original to R2, then append to src/content/photos/<section>.json.
 *
 * Idempotent: a photo whose id already exists in the manifest is left untouched
 * (so hand-written alt/title/tags/featured flags are never clobbered) and not
 * re-uploaded. Re-running on an unchanged directory is a no-op.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import exifr from 'exifr';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const MAX_EDGE = 4000; // R2 storage + PhotoSwipe ceiling; downscale before upload
const JPEG_QUALITY = 90;
const IMAGE_RE = /\.(jpe?g|png|tiff?|webp)$/i;

// ----------------------------------------------------------------------------
// args
// ----------------------------------------------------------------------------
function parseArgs(argv) {
  const args = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--section') args.section = argv[++i];
    else if (a === '--dir') args.dir = argv[++i];
    else if (a === '--help' || a === '-h') args.help = true;
    else console.warn(`Ignoring unknown argument: ${a}`);
  }
  return args;
}

const USAGE = `Usage: node scripts/ingest.mjs --section <slug> --dir <path> [--dry-run]`;

// ----------------------------------------------------------------------------
// helpers
// ----------------------------------------------------------------------------
const kebab = (s) =>
  s
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

const toHex = ({ r, g, b }) =>
  '#' + [r, g, b].map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')).join('');

async function loadSectionTitles() {
  try {
    const raw = await readFile(join(ROOT, 'src/content/sections.json'), 'utf-8');
    return new Map(JSON.parse(raw).map((s) => [s.id, s.title]));
  } catch {
    return new Map();
  }
}

/** Read the existing per-section manifest (array), or [] if absent. */
async function readManifest(section) {
  const path = join(ROOT, 'src/content/photos', `${section}.json`);
  if (!existsSync(path)) return { path, photos: [] };
  return { path, photos: JSON.parse(await readFile(path, 'utf-8')) };
}

/** Deterministic sort so git diffs stay readable: by date asc, then id. */
function sortManifest(photos) {
  return [...photos].sort((a, b) => {
    const da = a.date ? Date.parse(a.date) : Infinity;
    const db = b.date ? Date.parse(b.date) : Infinity;
    return da - db || a.id.localeCompare(b.id);
  });
}

/** Lazily build an R2 S3 client from env (only when actually uploading). */
async function makeR2Client() {
  const need = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'];
  const missing = need.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(
      `Missing R2 credentials: ${missing.join(', ')}.\n` +
        `Set them in .env (see .env.example) or run with --dry-run to skip uploading.`
    );
  }
  const { S3Client, PutObjectCommand, HeadObjectCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
  const bucket = process.env.R2_BUCKET;
  return {
    async exists(key) {
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return true;
      } catch {
        return false;
      }
    },
    async put(key, body) {
      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: 'image/jpeg' })
      );
    },
  };
}

/** Extract dimensions, dominant color, EXIF, and the stripped/downscaled buffer. */
async function processImage(filePath) {
  const original = await readFile(filePath);
  const hash8 = createHash('sha256').update(original).digest('hex').slice(0, 8);

  // Auto-orient from EXIF, downscale long edge, re-encode WITHOUT metadata
  // (this drops GPS and everything else — we carry what we display in the manifest).
  const buffer = await sharp(original)
    .rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();

  const meta = await sharp(buffer).metadata();
  const stats = await sharp(buffer).stats();

  let exif = {};
  try {
    exif = (await exifr.parse(original, { pick: ['DateTimeOriginal', 'Model', 'LensModel'] })) ?? {};
  } catch {
    /* no/broken EXIF — fine */
  }

  return {
    hash8,
    buffer,
    width: meta.width,
    height: meta.height,
    color: toHex(stats.dominant),
    date: exif.DateTimeOriginal instanceof Date ? exif.DateTimeOriginal : undefined,
    camera: exif.Model || undefined,
    lens: exif.LensModel || undefined,
  };
}

// ----------------------------------------------------------------------------
// main
// ----------------------------------------------------------------------------
async function main() {
  try {
    process.loadEnvFile(join(ROOT, '.env'));
  } catch {
    /* no .env — fine for --dry-run */
  }

  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.section || !args.dir) {
    console.log(USAGE);
    process.exit(args.help ? 0 : 1);
  }

  const dir = resolve(args.dir.replace(/^~/, process.env.HOME ?? '~'));
  if (!existsSync(dir) || !(await stat(dir)).isDirectory()) {
    console.error(`Not a directory: ${dir}`);
    process.exit(1);
  }

  const sectionTitles = await loadSectionTitles();
  if (!sectionTitles.has(args.section)) {
    console.warn(`⚠ Section "${args.section}" is not in sections.json — add it there before building.`);
  }
  const sectionTitle = sectionTitles.get(args.section) ?? args.section;

  const files = (await readdir(dir)).filter((f) => IMAGE_RE.test(f)).sort();
  if (!files.length) {
    console.error(`No images found in ${dir}`);
    process.exit(1);
  }

  const { path: manifestPath, photos } = await readManifest(args.section);
  const byId = new Map(photos.map((p) => [p.id, p]));

  const r2 = args.dryRun ? null : await makeR2Client();

  console.log(
    `\n${args.dryRun ? '[dry-run] ' : ''}Ingesting ${files.length} file(s) into section "${args.section}"\n`
  );

  const added = [];
  let skipped = 0;

  for (const filename of files) {
    const filePath = join(dir, filename);
    const stem = kebab(basename(filename, extname(filename)));
    const img = await processImage(filePath);
    const id = `${stem}-${img.hash8}`;

    if (byId.has(id)) {
      skipped++;
      console.log(`  = ${id}  (already ingested — left untouched)`);
      continue;
    }

    const year = img.date ? img.date.getFullYear() : 'undated';
    const key = `photos/${args.section}/${year}/${id}.jpg`;

    const entry = {
      id,
      key,
      section: args.section,
      // Stub alt so the build passes; every stubbed photo is flagged below for a
      // real alt-text pass. Screen readers deserve better than this placeholder.
      alt: `Photograph from the ${sectionTitle} collection`,
      tags: [],
      ...(img.date ? { date: img.date.toISOString() } : {}),
      width: img.width,
      height: img.height,
      color: img.color,
      featured: false,
      ...(img.camera ? { camera: img.camera } : {}),
      ...(img.lens ? { lens: img.lens } : {}),
    };

    if (!args.dryRun) {
      if (!(await r2.exists(key))) await r2.put(key, img.buffer);
    }

    byId.set(id, entry);
    added.push(entry);
    console.log(
      `  ${args.dryRun ? '·' : '+'} ${id}  ${img.width}×${img.height}  ${img.color}` +
        `  ${img.date ? img.date.toISOString().slice(0, 10) : 'undated'}  → ${key}`
    );
  }

  // ---- write manifest ----
  const finalPhotos = sortManifest([...byId.values()]);
  if (args.dryRun) {
    console.log(`\n[dry-run] Would write ${added.length} new entr${added.length === 1 ? 'y' : 'ies'} to ${manifestPath}`);
  } else if (added.length) {
    await writeFile(manifestPath, JSON.stringify(finalPhotos, null, 2) + '\n');
    console.log(`\nWrote ${manifestPath} (${finalPhotos.length} total, ${added.length} new)`);
  } else {
    console.log(`\nNothing new — ${manifestPath} unchanged`);
  }

  // ---- human-attention summary ----
  const needsAlt = added.filter((p) => p.alt.startsWith('Photograph from the'));
  const needsTitle = added.filter((p) => !p.title);
  const needsTags = added.filter((p) => !p.tags.length);
  console.log('\nSummary');
  console.log(`  new: ${added.length}   skipped (already ingested): ${skipped}`);
  if (needsAlt.length) console.log(`  ⚠ ${needsAlt.length} need real alt text (currently stubbed)`);
  if (needsTitle.length) console.log(`  · ${needsTitle.length} have no title`);
  if (needsTags.length) console.log(`  · ${needsTags.length} have no tags`);
  console.log('');
}

main().catch((err) => {
  console.error('\nIngest failed:', err.message);
  process.exit(1);
});
