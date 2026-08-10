import { z } from 'zod';
import { isValidTag } from './tags.mjs';

/**
 * Canonical photo schema — the single source of truth shared by the Astro
 * content collection (build time) and scripts/ingest.mjs (local CLI).
 *
 * `alt`, `width`, and `height` are required on purpose:
 *   - alt: a gallery with no alt text is not acceptable; fail the build.
 *   - width/height: PhotoSwipe requires predefined dimensions and reserving
 *     grid space by aspect-ratio is what gives zero layout shift.
 */
export const photoSchema = z.object({
  id: z.string(), // stable slug, e.g. "brc-2019-temple-dawn"
  key: z.string(), // R2 object key, e.g. "photos/burning-man/2019/brc-...-a1b2c3.jpg"
  section: z.string(), // slug matching sections.json
  title: z.string().optional(),
  caption: z.string().optional(),
  alt: z.string().min(1), // REQUIRED — accessibility
  // Controlled vocabulary — see src/content/tags.mjs. An unknown tag fails the
  // build so tag drift can't creep in across hundreds of photos.
  tags: z
    .array(
      z.string().refine(isValidTag, (t) => ({
        message: `Unknown tag "${t}". Add it to src/content/tags.mjs or fix the spelling.`,
      }))
    )
    .default([]),
  date: z.coerce.date().optional(), // from EXIF DateTimeOriginal
  width: z.number().int().positive(), // REQUIRED by PhotoSwipe
  height: z.number().int().positive(), // REQUIRED by PhotoSwipe
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i), // dominant color, used as the grid placeholder
  featured: z.boolean().default(false), // appears in homepage carousel
  camera: z.string().optional(),
  lens: z.string().optional(),
  order: z.number().optional(),
});

/** @typedef {import('zod').infer<typeof photoSchema>} Photo */

export const sectionSchema = z.object({
  id: z.string(), // slug, matches photo.section
  title: z.string(),
  description: z.string().optional(),
  cover: z.string().optional(), // photo id used as the section cover
  order: z.number().default(0), // sort order in the gallery index
});
