/**
 * Cloudflare Image Transformations URL builder.
 *
 * Originals live in R2, served from the same hostname as the transformation
 * endpoint (img.curtiskline.com). Serving source + transform from one host is
 * what makes `onerror=redirect` fall back to the untouched original if the
 * monthly transformation cap is ever hit (error 9422), instead of breaking the
 * page. Do not point this at a cross-origin source.
 */
const IMG_HOST = 'https://img.curtiskline.com';

export interface CfImageOpts {
  width: number;
  quality?: number;
  fit?: 'scale-down' | 'contain' | 'cover';
}

export function cfImage(key: string, opts: CfImageOpts): string {
  const params = [
    `width=${opts.width}`,
    `quality=${opts.quality ?? 82}`,
    `fit=${opts.fit ?? 'scale-down'}`,
    // `format=auto` counts as ONE transformation even when Cloudflare serves
    // AVIF to some visitors and WebP to others. Always use it.
    'format=auto',
    // Safety valve — see the note above.
    'onerror=redirect',
  ].join(',');
  const cleanKey = key.replace(/^\/+/, '');
  return `${IMG_HOST}/cdn-cgi/image/${params}/${cleanKey}`;
}

/**
 * The tight width ladder. Four widths per photo keeps the worst case at
 * 500 photos × 4 = 2,000 unique transformations/month, well inside the free
 * tier's 5,000. Do not add widths without recomputing that budget.
 */
export const WIDTHS = {
  grid: [400, 800],
  lightbox: [1200, 2400],
} as const;

/** Build a `srcset` string for a set of widths. */
export function cfSrcset(key: string, widths: readonly number[], opts?: Omit<CfImageOpts, 'width'>): string {
  return widths.map((w) => `${cfImage(key, { ...opts, width: w })} ${w}w`).join(', ');
}
