# curtiskline.com — Rebuild Handoff

**For:** Claude Code
**Date:** 2026-08-10
**Repo:** `curtiskline.github.io` → will be renamed/repurposed; site served from Cloudflare
**Live domain:** curtiskline.com

---

## 1. Objective

Rebuild the personal site with three goals, in priority order:

1. **Add a robust photo gallery** — sections, tags, filters, carousel, lightbox, fully responsive.
2. **Move hosting from GitHub Pages to Cloudflare** (Workers static assets).
3. **Modernize the existing code** without changing how the site looks.

The current homepage design (HTML5 UP "Highlights") stays visually intact. The visitor should not notice a redesign — they should notice the site got faster and gained a gallery.

---

## 2. Current state

| Item | Detail |
|---|---|
| Template | HTML5 UP "Highlights" by @ajlkn (CCA 3.0) |
| Structure | Single `index.html`, ~450 lines, 3 scroll sections + footer contact form |
| JS | jQuery 3.x, `jquery.scrollex`, `jquery.scrolly`, `browser.min.js`, `breakpoints.min.js`, `util.js`, `main.js` |
| CSS | Compiled `assets/css/main.css` + full SASS source in `assets/sass/` |
| Icons | Font Awesome 5 **full webfont set**, five formats each (`.eot .svg .ttf .woff .woff2`) ≈ 3.2 MB, for **6 icons actually used** |
| Images | `images/` ≈ 13 MB, unoptimized JPEGs |
| Forms | Formspree — `https://formspree.io/f/xwkywnqg` |
| Hosting | GitHub Pages, `CNAME` file → `curtiskline.com` |
| Cruft | `.DS_Store` committed in 4 places, empty `test.txt`, no `.gitignore`, no favicon, no OG tags, copyright hardcoded to 2022, large commented-out "Elements" demo block (lines 90–407) |
| A11y bug | `<meta name="viewport" ... user-scalable=no>` — blocks pinch zoom, WCAG failure |

**Icons actually in use:** `camera-retro`, `caravan`, `fire`, `smog` (solid), `linkedin`, `instagram` (brands). Six SVGs replace 3.2 MB of webfonts.

---

## 3. Decisions already made

These are settled. Do not re-litigate them.

| Decision | Choice | Rationale |
|---|---|---|
| Framework | **Astro** | Content collections model the gallery data natively; zero JS shipped except the lightbox; SCSS support out of the box means the existing HTML5 UP SASS ports directly |
| Hosting | **Cloudflare Workers static assets** | Cloudflare's recommended target for new projects as of 2026; Pages is being absorbed into Workers, with new features landing on Workers first |
| Photo storage | **R2 + Cloudflare Image Transformations** | Repo stays small; zero egress; 10 GB storage free; scales past 500 photos without git pain |
| Lightbox | **PhotoSwipe v5** (currently 5.4.4) | MIT licensed. lightGallery is GPLv3-or-commercial, which is a permanent constraint we don't need. PhotoSwipe has better touch/pinch-zoom and supports `data-pswp-srcset` |
| Scale target | **100–500 photos, images only** | No video. Do not add video plugins |
| Design | **Preserve the look, replace the code** | Same aesthetic, no jQuery, no webfont icons |

---

## 4. Target architecture

```
curtiskline.com                    → Worker (static assets)  → Astro dist/
img.curtiskline.com                → R2 bucket (custom domain, public)
img.curtiskline.com/cdn-cgi/image/ → Image Transformations at the edge
```

Originals live in R2, untouched, at full resolution. Every rendered `<img>` points at a transformation URL. The repo contains **no gallery photos** — only the metadata manifest and the small homepage images.

### Proposed repo layout

```
/
├─ src/
│  ├─ layouts/BaseLayout.astro
│  ├─ pages/
│  │  ├─ index.astro                    # homepage, single-page, unchanged design
│  │  ├─ gallery/
│  │  │  ├─ index.astro                 # all photos
│  │  │  ├─ [section].astro             # getStaticPaths over sections
│  │  │  └─ tag/[tag].astro             # getStaticPaths over tags
│  │  └─ 404.astro
│  ├─ components/
│  │  ├─ PhotoGrid.astro
│  │  ├─ PhotoCard.astro
│  │  ├─ FilterBar.astro
│  │  ├─ Carousel.astro
│  │  └─ Icon.astro                     # inline SVG sprite
│  ├─ content/
│  │  ├─ config.ts                      # Zod schemas
│  │  ├─ photos/                        # one YAML/JSON per section
│  │  │  ├─ burning-man.json
│  │  │  ├─ camping.json
│  │  │  └─ ...
│  │  └─ sections.json                  # section titles, descriptions, cover photo id, sort order
│  ├─ lib/
│  │  ├─ cfImage.ts                     # transformation URL builder
│  │  └─ gallery.ts                     # filter/sort/group helpers
│  ├─ scripts/
│  │  ├─ gallery-filter.ts              # client-side filtering
│  │  └─ lightbox.ts                    # PhotoSwipe init + deep linking
│  ├─ styles/                           # ported HTML5 UP SASS
│  └─ assets/images/                    # homepage images ONLY (pic01-03, bg) — Astro <Image>
├─ scripts/
│  └─ ingest.mjs                        # local CLI: photos → R2 + manifest
├─ docs/REBUILD-HANDOFF.md              # this file
├─ astro.config.mjs
├─ wrangler.jsonc
└─ .gitignore
```

---

## 5. Photo data model

Astro content collection, Zod-validated in `src/content/config.ts`.

```ts
const photo = z.object({
  id:        z.string(),                    // stable slug, e.g. "brc-2019-temple-dawn"
  key:       z.string(),                    // R2 object key, e.g. "photos/burning-man/2019/DSC_4412.jpg"
  section:   z.string(),                    // slug matching sections.json
  title:     z.string().optional(),
  caption:   z.string().optional(),
  alt:       z.string(),                    // REQUIRED — accessibility, not optional
  tags:      z.array(z.string()).default([]),
  date:      z.coerce.date().optional(),    // from EXIF DateTimeOriginal
  width:     z.number().int(),              // REQUIRED by PhotoSwipe
  height:    z.number().int(),              // REQUIRED by PhotoSwipe
  color:     z.string().regex(/^#[0-9a-f]{6}$/i), // dominant color, used as grid placeholder
  featured:  z.boolean().default(false),    // appears in homepage carousel
  camera:    z.string().optional(),
  lens:      z.string().optional(),
  order:     z.number().optional(),
});
```

**Notes:**

- `width`/`height` are non-negotiable — PhotoSwipe requires predefined dimensions and cannot infer them.
- `alt` is required by schema. Fail the build if missing. A gallery site with no alt text is not acceptable.
- `color` (6-byte hex) is used for the grid placeholder instead of a base64 LQIP. 500 inlined LQIPs would bloat the HTML; a dominant-color block plus `aspect-ratio` gives near-identical perceived performance at ~0.1% the bytes. If you later want blur-up, add an optional `lqip` field and only populate it for `featured` photos.
- The manifest is **build-time only**. It must never be shipped to the browser as JSON. The grid is server-rendered; the client filter operates on DOM `data-` attributes.

### Sections vs tags

- **Section** — exactly one per photo. Coarse, curated, stable. These become real routes. Seed set aligned with the existing homepage: `burning-man`, `camping`, `travel`, `portraits`, `misc`.
- **Tags** — many per photo. Fine-grained, freeform. Year, place, subject, mood. Tags get routes too, but only tags with ≥3 photos should generate a page (avoid a long tail of one-photo routes bloating the sitemap).

---

## 6. Ingest pipeline (`scripts/ingest.mjs`)

A local Node CLI. Curtis runs this on his machine; it never runs in CI.

```
node scripts/ingest.mjs --section burning-man --dir ~/Pictures/staging/brc2019 [--dry-run]
```

**Steps per file:**

1. Read with `sharp` → `width`, `height`.
2. Extract dominant color → `sharp(file).resize(1,1).raw()` → hex.
3. Read EXIF with `exifr` → `DateTimeOriginal`, `Model`, `LensModel`.
4. **Strip all GPS EXIF before upload.** This is a public personal photo site; do not publish home or campsite coordinates. Re-encode with `sharp(...).withMetadata({ exif: <filtered> })` or strip metadata entirely and carry the fields you want in the manifest instead. Prefer full strip — the manifest already holds what we display.
5. Generate stable `id` — kebab-case from filename plus a short content hash, so re-runs are idempotent and re-ingesting an unchanged file is a no-op.
6. Upload the stripped original to R2 under `photos/<section>/<year>/<id>.jpg` via the S3-compatible API (`@aws-sdk/client-s3` pointed at the R2 endpoint) or `wrangler r2 object put`.
7. Append/update the entry in `src/content/photos/<section>.json`, sorted deterministically so git diffs stay readable.
8. Print a summary of what needs human attention: photos missing `alt`, missing `title`, no tags.

**Requirements:**

- Idempotent. Running twice must not duplicate entries.
- `--dry-run` prints the plan without uploading or writing.
- Never uploads an original larger than ~4000px on the long edge — downscale first. PhotoSwipe's practical ceiling is ~3000×3000 for the displayed image, and R2 storage costs scale with original size.
- R2 credentials from environment (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`) via `.env`, which is gitignored.

---

## 7. Image delivery

### URL builder — `src/lib/cfImage.ts`

```ts
const IMG_HOST = 'https://img.curtiskline.com';

export function cfImage(key: string, opts: {
  width: number;
  quality?: number;
  fit?: 'scale-down' | 'contain' | 'cover';
}) {
  const params = [
    `width=${opts.width}`,
    `quality=${opts.quality ?? 82}`,
    `fit=${opts.fit ?? 'scale-down'}`,
    'format=auto',
    'onerror=redirect',
  ].join(',');
  return `${IMG_HOST}/cdn-cgi/image/${params}/${key}`;
}
```

### Width ladder — keep it tight

| Use | Widths |
|---|---|
| Grid thumbnail | 400, 800 |
| Lightbox | 1200, 2400 |

**Four widths per photo. Do not add more without recalculating the budget.**

### Cost budget

Cloudflare Free plan allows **5,000 unique transformations per calendar month**. Repeat requests for the same transformation within a month count once.

- 500 photos × 4 widths = **2,000 unique transformations/month** at absolute worst case (every photo, every size, viewed at least once). Comfortably inside the free tier.
- `format=auto` counts as **one** transformation even when Cloudflare serves AVIF to some visitors and WebP to others. Always use it.
- Adding a fifth and sixth width would push the worst case to 3,000 — still free, but the headroom shrinks. Adding photos past ~1,200 crosses the free tier at 4 widths.
- Paid overage is $0.50 per 1,000. Even a 5× overrun costs a few dollars a month.

**Safety valve:** `onerror=redirect` is included in every URL. If the monthly cap is ever exceeded, Cloudflare returns error `9422` for new transformations — with `onerror=redirect` it falls back to serving the original image instead of breaking the page. This only works because the source is on the same domain as the transformation, which is why images are served from `img.curtiskline.com/cdn-cgi/image/...` rather than transforming a cross-origin URL.

### Verify before building on it

Confirm that `/cdn-cgi/image/` is intercepted at the edge on the R2 custom domain hostname. It should be — the custom domain is a proxied record on the `curtiskline.com` zone — but test it with a single uploaded file before wiring up the whole gallery. If it does not work, the fallback is to serve transformations from the apex (`curtiskline.com/cdn-cgi/image/<opts>/https://img.curtiskline.com/<key>`), which requires enabling remote-origin transformations on the zone and loses the same-domain `onerror` fallback.

---

## 8. Gallery UX spec

### Routes

| Route | Content | Generation |
|---|---|---|
| `/gallery/` | All photos, newest first | static |
| `/gallery/[section]/` | One section | `getStaticPaths` over `sections.json` |
| `/gallery/tag/[tag]/` | One tag, tags with ≥3 photos only | `getStaticPaths` over tag index |

### Filtering

Server-rendered grid, client-side filtering, URL-synced state.

- The full grid for the current route is rendered in HTML. JS **hides** non-matching cards — it never fetches or builds DOM. Works with JS disabled; the unfiltered grid is always present.
- Active filters live in query params: `/gallery/?tags=desert,night&year=2019`.
- Filter changes call `history.replaceState` so the URL is copyable. Back/forward via a `popstate` listener.
- Multi-tag semantics: **AND**. Selecting `desert` + `night` shows photos with both. State this in the UI ("showing photos tagged desert **and** night") so it isn't ambiguous.
- Show a live count: "48 of 312 photos". Show an empty state with a "clear filters" action.
- Filter chips must be real `<button>` elements with `aria-pressed`, not divs.

### Grid layout

CSS Grid with `aspect-ratio` boxes derived from the stored `width`/`height`. This gives **zero cumulative layout shift** — the space is reserved before the image loads.

Do **not** use CSS multi-column masonry. It orders items top-to-bottom within each column, which scrambles chronological sequence and confuses PhotoSwipe's index order.

- Placeholder: `background-color: var(--photo-color)` from the `color` field, transitioning out on image load.
- `loading="lazy"` and `decoding="async"` on every grid image except the first row.
- `sizes` attribute must match the actual grid column widths at each breakpoint, or the browser downloads the wrong candidate.

### Lightbox — `src/scripts/lightbox.ts`

PhotoSwipe v5, dynamically imported so it only loads on gallery routes and only when Core is needed:

```ts
import PhotoSwipeLightbox from 'photoswipe/lightbox';
import 'photoswipe/style.css';

const lightbox = new PhotoSwipeLightbox({
  gallery: '#photo-grid',
  children: 'a.photo-link',
  pswpModule: () => import('photoswipe'),
});
```

Each grid item must be an `<a>` with:

- `href` — the 2400px transformation URL (also the no-JS fallback: clicking opens the full image)
- `data-pswp-width` / `data-pswp-height` — largest served size
- `data-pswp-srcset` — the 1200w and 2400w candidates; PhotoSwipe generates `sizes` automatically and re-adjusts on zoom
- a nested `<img>` thumbnail

**Deep linking.** PhotoSwipe v5 dropped v4's built-in history module. Implement it manually — roughly 30 lines:

- On `change`, push `?photo=<id>` (preserving existing filter params).
- On `close`, restore the pre-open URL.
- On page load, if `?photo=<id>` is present, find the matching index in the current gallery and call `lightbox.loadAndOpen(index)`.

**Captions.** Register a custom UI element via `lightbox.on('uiRegister', ...)` reading `data-caption` / `data-tags` from the anchor. Prefer this over the third-party dynamic-caption plugin — fewer dependencies, and the tags need to be clickable links back into the filter.

Also required:

- `Escape` closes; arrow keys navigate — PhotoSwipe handles both, verify not broken.
- Respect `prefers-reduced-motion` — set `showHideAnimationType: 'none'` when it matches.
- Counter and close button visible on mobile.

### Carousel

A `featured: true` horizontal strip on the homepage, linking into `/gallery/`.

**No library.** CSS scroll-snap:

```css
.carousel { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; }
.carousel > * { flex: 0 0 auto; scroll-snap-align: center; }
```

Add prev/next buttons calling `scrollBy({ left, behavior: 'smooth' })`. Hide them when `prefers-reduced-motion` is set, or drop the smooth behavior. This is ~20 lines and will not conflict with PhotoSwipe, which a second gallery library would.

---

## 9. Modernizing the homepage

Same visual output, none of the jQuery.

| Remove | Replace with |
|---|---|
| `jquery.min.js` (~90 KB) | — nothing needs it |
| `jquery.scrollex` | `IntersectionObserver` for the section reveal/`is-inactive` toggling |
| `jquery.scrolly` | CSS `scroll-behavior: smooth` on `html` + `element.scrollIntoView()` for the "Next" anchors |
| `browser.min.js`, `util.js` | Delete. Feature-detection for browsers we no longer support |
| `breakpoints.min.js` | Delete the JS. **Keep** `assets/sass/libs/_breakpoints.scss` — that's CSS-side and the whole layout depends on it |
| Font Awesome webfonts (3.2 MB) | Inline SVG sprite with the 6 icons in use, via `<Icon />` component |

**Port the SASS as-is.** `assets/sass/main.scss` and `assets/sass/libs/` move to `src/styles/` largely unchanged — Astro compiles SCSS natively. This is what preserves the look. Resist the urge to rewrite it; only touch what's needed to remove Font Awesome class dependencies and add gallery styles.

**Also fix while in there:**

- Remove `user-scalable=no` from the viewport meta. Accessibility failure.
- Delete the commented-out "Elements" demo block (lines 90–407 of `index.html`).
- Delete `test.txt` and all `.DS_Store`; add `.gitignore` covering `.DS_Store`, `node_modules`, `dist`, `.env`, `.wrangler`.
- Add favicon set and `site.webmanifest`.
- Add OG/Twitter meta with a strong photo as the share image.
- `&copy; 2022` → dynamic year.
- Add `@astrojs/sitemap` and a `robots.txt`.
- Keep the HTML5 UP attribution in the footer and `LICENSE.txt` — CCA 3.0 requires it.

**Contact form:** keep Formspree. It works and migrating it adds risk for no benefit (MailChannels' free Workers email relay ended in 2024, so a self-hosted replacement means Resend or similar). If spam becomes a problem, add Cloudflare Turnstile in front of it.

---

## 10. Deployment

### `wrangler.jsonc`

```jsonc
{
  "name": "curtiskline-com",
  "compatibility_date": "2026-08-01",
  "assets": { "directory": "./dist", "not_found_handling": "404-page" }
}
```

Fully static — **no adapter, no Worker script needed.** `@astrojs/cloudflare` is only required for SSR, which this site doesn't use. Keep Astro on `output: 'static'`.

### Cutover sequence

Do it in this order. Do not skip step 4.

1. Create the R2 bucket. Attach `img.curtiskline.com` as a custom domain (requires `curtiskline.com` to be an active zone in the same Cloudflare account).
2. Ingest a handful of test photos. **Verify `/cdn-cgi/image/` transformations work on that hostname** before building the gallery on top of the assumption.
3. Connect the repo to Cloudflare Workers Builds. Deploy. Verify everything on the `*.workers.dev` preview URL — homepage, gallery, filters, lightbox, deep links, 404.
4. **Only then** move the `curtiskline.com` DNS/custom domain onto the Worker.
5. Disable GitHub Pages in repo settings. Delete the `CNAME` file — it's a GitHub Pages artifact with no meaning on Cloudflare.
6. Consider renaming the repo away from `curtiskline.github.io`, since the name now describes hosting that's no longer used.

### Checks before flipping DNS

- Lighthouse ≥ 95 on performance and accessibility, mobile profile, on `/gallery/`.
- Zero CLS on the grid.
- Total JS on the homepage under 10 KB (should be near zero — only the IntersectionObserver snippet).
- Gallery works with JS disabled: grid renders, images load, clicking opens the full image.
- Keyboard-only traversal of grid → lightbox → close returns focus to the originating thumbnail.
- Every photo has non-empty `alt`.
- Deep link `?photo=<id>` opens the correct photo on cold load.
- No GPS EXIF in any object in the R2 bucket — spot-check with `exiftool`.

---

## 11. Suggested phasing

Each phase should end in a working, deployable state.

| Phase | Scope |
|---|---|
| **1 — Scaffold** | Astro project, SASS ported, homepage rebuilt jQuery-free with inline SVG icons, deployed to Workers on a preview URL. Visually identical to today. No gallery yet. |
| **2 — Pipeline** | R2 bucket, `img.curtiskline.com`, `cfImage()` helper, `ingest.mjs`, content schemas. Ingest one section as a proof. Transformations verified working. |
| **3 — Gallery core** | `/gallery/` and `/gallery/[section]/`, PhotoGrid with aspect-ratio boxes and color placeholders, PhotoSwipe wired up with srcset. |
| **4 — Filters & polish** | Tag routes, FilterBar with URL sync, deep-linkable lightbox, homepage carousel, captions, empty states. |
| **5 — Cutover** | Favicon, OG tags, sitemap, robots, 404. Run the full check list. Flip DNS. Retire GitHub Pages. |

---

## 12. Open items for Curtis

Not blockers for phases 1–2; needed before phase 3 is meaningful.

1. **Section list** — confirm or revise the seed set (`burning-man`, `camping`, `travel`, `portraits`, `misc`).
2. **Tag vocabulary** — freeform per photo, or a controlled list enforced by the Zod schema? A controlled list prevents `desert` / `Desert` / `deserts` drift across 500 photos. Recommended.
3. **Source photos** — where do the 100–500 originals currently live, and are they already culled and edited, or does ingest need to handle a raw dump?
4. **Alt text** — required by schema, so 500 photos need 500 alt strings. Options: write them during ingest, or have `ingest.mjs` stub them from title/section and flag them for a later pass. Decide before bulk ingest, not after.
5. **Homepage copy** — the existing three sections carry over verbatim unless you want edits while the file is open.

---

## Reference

- [Cloudflare Images pricing](https://developers.cloudflare.com/images/pricing/) — transformation counting, free tier limits
- [Cloudflare Images features](https://developers.cloudflare.com/images/optimization/features/) — full transformation parameter list, `onerror`
- [R2 public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/) — custom domain setup
- [Migrate from Pages to Workers](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/)
- [PhotoSwipe getting started](https://photoswipe.com/getting-started) — required markup, `data-pswp-srcset`
- [PhotoSwipe events](https://photoswipe.com/events) — for the deep-linking handler
- [lightGallery license](https://www.lightgalleryjs.com/docs/license/) — GPLv3/commercial, why we didn't use it
