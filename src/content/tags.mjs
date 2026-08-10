/**
 * Controlled tag vocabulary — the single source of truth for photo tags.
 *
 * Why controlled: across hundreds of photos, freeform tags drift
 * (desert / Desert / deserts) and fracture the filter UI. Every tag on every
 * photo is validated against this list at build time; an unknown tag fails the
 * build with a message pointing back here.
 *
 * To add a tag: add one kebab-case entry below. Keep it lowercase, hyphenated,
 * and singular. 4-digit years (e.g. "2019") are always allowed without listing.
 *
 * This is a starter set based on the site's sections — prune or expand freely.
 */
export const TAG_VOCABULARY = [
  // places
  'black-rock-city',
  'nevada',
  'california',
  'oklahoma',
  'tahoe',
  'san-francisco',
  'new-york',
  'tulsa',

  // subjects
  'desert',
  'playa',
  'art',
  'fire',
  'landscape',
  'mountains',
  'water',
  'sky',
  'city',
  'street',
  'portrait',
  'people',
  'tent',
  'campfire',
  'bicycle',

  // time / light / mood
  'night',
  'sunrise',
  'sunset',
  'golden-hour',
  'blue-hour',
  'dust',
  'storm',
];

const YEAR_RE = /^(19|20)\d{2}$/;

/** A tag is valid if it's in the vocabulary or a 4-digit year. */
export function isValidTag(tag) {
  return TAG_VOCABULARY.includes(tag) || YEAR_RE.test(tag);
}
