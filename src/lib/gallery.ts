import type { CollectionEntry } from 'astro:content';

export type Photo = CollectionEntry<'photos'>;
export type Section = CollectionEntry<'sections'>;

/** Newest first; photos without a date sort after dated ones, then by id. */
export function sortByDateDesc(photos: Photo[]): Photo[] {
  return [...photos].sort((a, b) => {
    const da = a.data.date?.getTime();
    const db = b.data.date?.getTime();
    if (da != null && db != null) return db - da;
    if (da != null) return -1;
    if (db != null) return 1;
    return a.data.id.localeCompare(b.data.id);
  });
}

/** Photos in a given section, newest first. */
export function inSection(photos: Photo[], section: string): Photo[] {
  return sortByDateDesc(photos.filter((p) => p.data.section === section));
}

/** Featured photos for the homepage carousel, honoring explicit `order`. */
export function featured(photos: Photo[]): Photo[] {
  return photos
    .filter((p) => p.data.featured)
    .sort((a, b) => (a.data.order ?? Infinity) - (b.data.order ?? Infinity) || a.data.id.localeCompare(b.data.id));
}

/**
 * Tag index: tag -> photos, keeping only tags with at least `min` photos so a
 * long tail of one-photo tags doesn't bloat the sitemap. Returns a sorted map.
 */
export function tagIndex(photos: Photo[], min = 3): Map<string, Photo[]> {
  const byTag = new Map<string, Photo[]>();
  for (const photo of photos) {
    for (const tag of photo.data.tags) {
      (byTag.get(tag) ?? byTag.set(tag, []).get(tag)!).push(photo);
    }
  }
  const kept = [...byTag.entries()]
    .filter(([, list]) => list.length >= min)
    .sort(([a], [b]) => a.localeCompare(b));
  return new Map(kept.map(([tag, list]) => [tag, sortByDateDesc(list)]));
}

/** The aspect ratio string for CSS `aspect-ratio`, reserving grid space (zero CLS). */
export function aspectRatio(photo: Photo): string {
  return `${photo.data.width} / ${photo.data.height}`;
}
