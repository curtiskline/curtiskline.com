# curtiskline.com — Rebuild Status & Working Notes

**Updated:** 2026-08-11
**Companion to:** [`REBUILD-HANDOFF.md`](./REBUILD-HANDOFF.md) — that doc is the *plan* (why Astro, why Cloudflare, the UX spec). **This doc is what was actually built, the decisions made along the way, and how to keep working on it.**

> Read this first when picking the project up on a new machine. Claude Code's per-machine memory does **not** sync across computers; everything you need is captured here and in the repo.

---

## 1. TL;DR — where things stand

All five phases from the handoff are **built, committed, and on `main`**. The site is **deployed and verified on a Cloudflare Worker preview URL**. The only thing left is finishing the DNS cutover and post-cutover cleanup.

| Phase | Status |
|---|---|
| 1 — Scaffold (Astro homepage, jQuery-free) | ✅ done |
| 2 — Pipeline (R2 + `ingest.mjs` + `cfImage`) + infra provisioned | ✅ done, live |
| 3 — Gallery core (routes, grid, PhotoSwipe) | ✅ done |
| 4 — Filters, tag routes, homepage carousel | ✅ done |
| 5 — Favicon/OG/sitemap/robots/404 + perf | ✅ done |
| Cutover (deploy → flip DNS → retire Pages) | 🔶 **in progress** |

**Live preview:** https://curtiskline-github-io.prime-561.workers.dev (verified: all routes 200, custom 404, gallery images load from the transform CDN, zero console errors).

**In flight:** DNS for `curtiskline.com` is being pointed at the Worker. Until that propagates, GitHub Pages still "owns" the apex and now serves 404 (main no longer has a root `index.html` — that's expected and accepted).

---

## 2. Live infrastructure (Cloudflare)

Everything is on the Cloudflare account that manages the domain. **`wrangler` must be logged into this account** (`wrangler login`) to touch any of it.

| Thing | Value |
|---|---|
| CF account | **prime@rr0.dev** (this account manages curtiskline.com; the domain lives here even though Curtis's primary email differs) |
| Account ID | `561879d9155cff5f7d2b079c60fd6423` |
| Zone | curtiskline.com — Zone ID `830be106c1902835a81016a05a41696f` |
| R2 bucket | `curtiskline-photos` (originals live here, EXIF-stripped) |
| Image host | `img.curtiskline.com` — R2 custom domain, **Image Transformations enabled** on the zone |
| Worker (preview) | `curtiskline-github-io.prime-561.workers.dev` (deployed via Workers Builds) |
| Contact form | Formspree `https://formspree.io/f/xwkywnqg` (kept as-is) |

Notes:
- Transformations verified: `format=auto` serves AVIF/WebP; the 400/800/1200/2400 ladder all return 200.
- Image Transformations were enabled **in the dashboard** — the `wrangler` OAuth token lacks the scope to toggle zone settings via API.
- `wrangler.jsonc` sets `name: "curtiskline-com"`, but the deployed Worker is named `curtiskline-github-io` (Workers Builds named it from the repo). Non-blocking, but reconcile if you ever `wrangler deploy` locally — it would target `curtiskline-com` and create a *second* Worker. Align the name before doing local deploys.

**Secrets are NOT in the repo.** `ingest.mjs` needs R2 S3 credentials in `.env` (gitignored). See §5.

---

## 3. Decisions made during the build (deltas from the handoff)

The handoff proposed an approach; these are the concrete choices and course-corrections that aren't obvious from it:

1. **The old compiled CSS had drifted from the SASS source.** `assets/css/main.css` (the live stylesheet) was hand-edited so the header title/tagline were **black**, while the SASS still produced the template default (white). The compiled CSS was the real source of truth. This is preserved as an explicit override at the end of `src/styles/main.scss`. If the look ever seems off vs. the old site, that's the place to check.
2. **Astro scaffolded by hand**, not `npm create astro` — deterministic, no interactive prompts. Static output, no adapter (`wrangler.jsonc` serves `./dist` as static assets; no Worker script).
3. **jQuery → tiny inline script** in `BaseLayout.astro`: `IntersectionObserver` drives the per-section fixed-background cross-fade (`rootMargin: -50% 0 -50%` = "section at viewport center"); the header-title fade is `opacity = 1 - scrollY/headerHeight`; CSS `scroll-behavior: smooth` replaces `jquery.scrolly`.
4. **Font Awesome (3.2 MB webfonts) → 6 inline SVGs** in `Icon.astro` (FA 5.15.4 paths). The loader spinner glyph was neutralized (no font to draw it).
5. **Controlled tag vocabulary** (Curtis's choice). `src/content/tags.mjs` is the single list; the Zod schema and `ingest.mjs` both enforce it; **4-digit years are auto-allowed** without listing. An unknown tag fails the build with a message pointing at `tags.mjs`.
6. **Shared photo schema** — `src/content/photo-schema.mjs` (plain `.mjs`, `zod`) is imported by *both* the Astro content collection and `ingest.mjs`, so there's one source of truth. `alt`, `width`, `height` are required.
7. **Placeholder color = sharp `.stats().dominant`** (hex), not a base64 LQIP. For the ingested night photos this comes out near-black, which is correct.
8. **Homepage images were the real perf problem.** The fixed `html` background `bg.jpg` shipped at **2.5 MB** (and `pic01–03` at ~2.4 MB each). That was the 16s Lighthouse LCP. Re-encoded with sharp to 2048–2560px mozjpeg (~10 MB → ~460 KB total), visually identical. This is why `/gallery/` went 74 → ~95.
9. **Fonts moved out of render-blocking CSS.** Raleway is now a preconnected `<link ... display=swap>` in `BaseLayout` (was an `@import` in `main.scss`).
10. **Homepage `#photos` carousel** is the gallery's entry point. It shows `featured: true` photos, falling back to the most-recent when none are flagged.
11. **Deep linking is hand-rolled** (PhotoSwipe v5 dropped v4's history module): `?photo=<id>` via `replaceState` + `popstate`, cold-load open. Lightbox excludes filter-hidden cards via `a.photo-card:not(.is-hidden)`.
12. **`[hidden]{display:none}` normalize added** — the HTML5 UP reset omitted it, so button/element display rules were overriding the UA hidden behavior (broke the filter "Clear" button and grid-hide toggles until fixed).

### Open decisions / known gaps
- **Green button contrast (WCAG AA).** `.button.primary` is light green `#8cd1a8` + white text → fails AA. It's the brand color used site-wide (buttons + active filter chips). **Left as-is on purpose** to preserve the look. Deferred to Curtis: nudge the accent to an AA-passing green, or use dark text on green.
- **Alt text for future photos.** The 13 current photos have real, hand-written alt. New ingests **stub** `alt` (`"Photograph from the <Section> collection"`) and flag them — write real alt before considering a section done. I generate a labeled contact sheet to do this efficiently (see §5).
- Titles/captions are optional and mostly unset.

---

## 4. Repo layout (what lives where)

```
src/
├─ layouts/
│  ├─ BaseLayout.astro        # <html>, head (meta/OG/icons/fonts), no-jQuery script, <main>
│  └─ GalleryLayout.astro     # gallery chrome: nav + FilterBar + PhotoGrid + gallery CSS + lightbox/filter imports
├─ pages/
│  ├─ index.astro             # homepage (single page) + #photos carousel section
│  ├─ 404.astro
│  └─ gallery/
│     ├─ index.astro          # all photos
│     ├─ [section].astro      # getStaticPaths over sections with photos
│     └─ tag/[tag].astro      # getStaticPaths over tags with >=3 photos
├─ components/
│  ├─ Icon.astro              # inline SVG icons (6)
│  ├─ PhotoGrid.astro / PhotoCard.astro
│  ├─ FilterBar.astro
│  └─ Carousel.astro          # homepage scroll-snap carousel (self-contained script+style)
├─ content/
│  ├─ photo-schema.mjs        # shared Zod schema (Astro + ingest)
│  ├─ tags.mjs                # controlled tag vocabulary + isValidTag()
│  ├─ sections.json           # section definitions
│  └─ photos/<section>.json   # one manifest per section, written by ingest (burning-man.json exists)
├─ content.config.ts          # `photos` (custom loader over photos/*.json) + `sections` collections
├─ lib/
│  ├─ cfImage.ts              # transform URL builder + WIDTHS ladder + cfSrcset
│  └─ gallery.ts              # sort/section/featured/tagIndex/aspectRatio/pswpDimensions
├─ scripts/
│  ├─ lightbox.ts             # PhotoSwipe init, captions (clickable tags), deep linking, fade-in
│  └─ filter.ts               # URL-synced tag filtering (AND, aria-pressed, count, empty state)
└─ styles/                    # ported HTML5 UP SASS (main.scss + libs/)

scripts/
├─ ingest.mjs                 # local photo ingest CLI  (npm run ingest)
└─ gen-assets.mjs             # generates favicon set + og.jpg into public/

public/                       # favicons, og.jpg, robots.txt, site.webmanifest,
                              # images/ (bg + pic01-03, optimized), overlay.png, arrow.svg
wrangler.jsonc                # static-assets Worker config (serves ./dist)
astro.config.mjs             # site, static output, @astrojs/sitemap, SASS deprecation silencing
```

Kept from the old site: `LICENSE.txt` + the HTML5 UP footer attribution (CCA 3.0 requires it). `CNAME` is still present — **delete it at cutover** (GitHub Pages artifact).

---

## 5. How to work on it (new machine setup)

```bash
git clone https://github.com/curtiskline/curtiskline.github.io.git
cd curtiskline.github.io
npm install            # Node 26 used here; Astro 5.18. If sharp/esbuild binaries
                       # don't install, allow install scripts (npm approve-scripts).
npm run dev            # local dev server
npm run build          # -> dist/  (this is what the Worker serves)
```

**Ingesting photos** (uploads to R2, writes the manifest):
```bash
# 1. one-time: get R2 S3 credentials (Cloudflare dashboard → R2 → Manage API Tokens,
#    Object Read & Write), then:
cp .env.example .env    # fill R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY
                        # (account id + bucket are already in .env.example; .env is gitignored)

# 2. dry run first (no upload, no writes):
npm run ingest -- --section burning-man --dir ~/Photos/interfuse --tags interfuse,2025 --dry-run

# 3. real run (drop --dry-run). Idempotent: re-running skips already-ingested photos
#    (so curated alt/tags survive). Each run strips EXIF/GPS, downscales to <=4000px,
#    uploads, appends to src/content/photos/<section>.json.
```
- Sections must exist in `src/content/sections.json`; tags must be in `src/content/tags.mjs` (add new ones there first — one kebab-case line).
- **Write real alt text** after ingest. Fast way: generate a labeled contact sheet of a section's photos (a small sharp script that fetches `width=700` transforms and tiles them with their IDs), eyeball it, then set each `alt` in the section JSON. The build fails if any `alt` is empty.

**Regenerating brand assets** (favicon + OG card) after changing `public/favicon.svg` or the OG source photo:
```bash
node scripts/gen-assets.mjs
```

**Deploy:** Workers Builds is connected to the repo and deploys `main` automatically (`npm run build` → `npx wrangler deploy` serving `./dist`). Just push to `main`.

---

## 6. Gotchas (things that bit us / non-obvious)

- **`wrangler r2 object put/delete` defaults to LOCAL** storage — pass `--remote` to touch the real bucket.
- **`ingest.mjs` reuses the schema**; an invalid tag or empty alt fails `npm run build`, not just ingest.
- **The `photos` collection warns "collection is empty"** until at least one photo is ingested — harmless.
- **Lighthouse mobile is Lantern-simulated** slow-4G; image galleries score lower than they behave in reality. The big real fix was optimizing `bg.jpg`/`pic0x`. CLS is 0 (aspect-ratio boxes), JS is near-zero.
- **`sizes` on grid images must match real column widths** or the browser over-fetches (we had `100vw` on mobile pulling 800w for every card — fixed).
- **SASS deprecation warnings** (`@elseif`, `slash-div`, etc.) are silenced/ignored in `astro.config.mjs`; the ported HTML5 UP libs use old syntax. Fine on current Dart Sass.
- Playwright isn't a dependency; screenshots during the build were done with `playwright-core --no-save` driving system Chrome (it gets pruned by later `npm install`s — reinstall as needed). Not part of the project.

---

## 7. What's left

**Finish cutover (Cloudflare/GitHub, mostly done by Curtis):**
- [ ] `curtiskline.com` DNS → the Worker (add apex as a Worker custom domain). *In progress.*
- [ ] After apex is live, re-verify on `curtiskline.com` (routes, gallery, lightbox, deep links, `img.curtiskline.com` same-origin `onerror` fallback — only fully applies on the apex).
- [ ] Disable GitHub Pages; delete `CNAME`.
- [ ] (Optional) rename the repo away from `curtiskline.github.io`.

**Product / content:**
- [ ] Decide the green-button contrast question (§3).
- [ ] Ingest the other sections (`camping`, `travel`, `portraits`, `misc`) + write alt text.
- [ ] Optionally flag `featured: true` photos to curate the homepage carousel (else it shows most-recent).

---

## 8. Commit history (branch merged to `main`)

```
2c8e41a  Fix homepage Next arrow skipping the Photography section
1cc8dc3  Write real alt text for the 13 Interfuse photos
5064304  Phase 5 (build items): favicon, OG, sitemap, robots, 404, perf
fb3a8fb  Phase 4: tag routes, filter bar, homepage carousel, caption tags
828b411  Ingest 13 Interfuse 2025 photos into burning-man
643941b  Controlled tag vocabulary (schema + ingest enforcement)
204a636  Phase 3: gallery core — routes, grid, PhotoSwipe lightbox
d3a30de  Phase 2: provision R2 + verify transformations
38c148a  Phase 2: photo pipeline — schema, cfImage(), gallery helpers, ingest CLI
82b7be9  Phase 1: rebuild homepage in Astro, jQuery-free
```
