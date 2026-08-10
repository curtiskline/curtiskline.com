import { defineCollection } from 'astro:content';
import { file } from 'astro/loaders';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
// Schema is shared verbatim with scripts/ingest.mjs — one source of truth.
import { photoSchema, sectionSchema } from './content/photo-schema.mjs';

const PHOTOS_DIR = join(process.cwd(), 'src/content/photos');

/**
 * Custom loader: one entry per photo, sourced from per-section JSON array files
 * (src/content/photos/<section>.json). Per-section files keep git diffs readable
 * and let ingest.mjs append deterministically; the loader flattens them into a
 * single photo-per-entry collection for the gallery to query.
 */
const photos = defineCollection({
  loader: {
    name: 'photos-loader',
    async load({ store, parseData, logger }) {
      store.clear();
      let files: string[] = [];
      try {
        files = (await readdir(PHOTOS_DIR)).filter((f) => f.endsWith('.json'));
      } catch {
        logger.warn(`No photos directory at ${PHOTOS_DIR} yet — collection is empty.`);
        return;
      }
      for (const filename of files.sort()) {
        const section = filename.replace(/\.json$/, '');
        const raw = await readFile(join(PHOTOS_DIR, filename), 'utf-8');
        const entries: unknown[] = JSON.parse(raw);
        for (const entry of entries) {
          const withSection = { section, ...(entry as Record<string, unknown>) };
          const data = await parseData({ id: (withSection as { id: string }).id, data: withSection });
          store.set({ id: data.id, data });
        }
      }
      logger.info(`Loaded ${store.keys().length} photo(s) from ${files.length} section file(s).`);
    },
  },
  schema: photoSchema,
});

const sections = defineCollection({
  loader: file('src/content/sections.json'),
  schema: sectionSchema,
});

export const collections = { photos, sections };
