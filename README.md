# curtiskline.com

Personal site and photo gallery for **[curtiskline.com](https://curtiskline.com)**.

Astro static site, deployed to a Cloudflare Worker. Photos live in R2 and are resized
at the edge by Cloudflare Image Transformations — the repo contains no gallery photos,
only their metadata.

```
curtiskline.com                    →  Worker (static assets)  →  Astro dist/
img.curtiskline.com                →  R2 bucket (public custom domain)
img.curtiskline.com/cdn-cgi/image/ →  Image Transformations at the edge
```

**Stack:** Astro 5 (`output: 'static'`, no adapter) · SCSS · PhotoSwipe 5 · Zod · Cloudflare Workers + R2

No jQuery, no icon webfonts, no UI framework. The only client-side JS is a small
scroll script, the gallery filter, and the lightbox (dynamically imported on gallery
routes only).

---

## Quick start

Developed on Node 24 (no `engines` pin; Astro 5 needs 18.20+ / 20.3+ / 22+).

```bash
npm install     # if sharp/esbuild binaries fail, allow install scripts: npm approve-scripts
npm run dev     # local dev server
npm run build   # → dist/  (this is what the Worker serves)
npm run preview # serve the built output
```

| Script | What it does |
|---|---|
| `npm run dev` | Astro dev server |
| `npm run build` | Static build to `dist/` |
| `npm run preview` | Preview the built site |
| `npm run ingest` | Photo ingest CLI (see below) |
| `node scripts/gen-assets.mjs` | Regenerate favicon set + `og.jpg` into `public/` |

---

## Layout

```
src/
├─ layouts/       BaseLayout (head, meta, scroll script) · GalleryLayout (nav, filter, grid)
├─ pages/         index.astro · 404.astro · gallery/{index,[section],tag/[tag]}.astro
├─ components/    PhotoGrid · PhotoCard · FilterBar · Carousel · Icon (inline SVGs)
├─ content/       photo-schema.mjs · tags.mjs · sections.json · photos/<section>.json
├─ lib/           cfImage.ts (transform URLs) · gallery.ts (sort/group helpers)
├─ scripts/       lightbox.ts (PhotoSwipe + deep links) · filter.ts (URL-synced tags)
└─ styles/        ported HTML5 UP SASS

scripts/          ingest.mjs (photos → R2 + manifest) · gen-assets.mjs
public/           favicons, og.jpg, robots.txt, homepage images
```

Two things are deliberately shared rather than duplicated:

- **`src/content/photo-schema.mjs`** — one Zod schema imported by *both* the Astro
  content collection and `ingest.mjs`. `alt`, `width`, and `height` are required.
- **`src/content/tags.mjs`** — a controlled tag vocabulary. Any tag not listed there
  (4-digit years excepted) **fails the build**, which keeps `desert`/`Desert`/`deserts`
  from fragmenting the filters.

Because the schema is shared, a bad tag or an empty `alt` breaks `npm run build`, not
just ingest. That's intentional.

---

## Adding photos

Ingest runs locally only — never in CI. It strips EXIF/GPS, downscales to ≤4000px,
uploads to R2, and appends to the section manifest.

```bash
cp .env.example .env    # fill in R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY
                        # (Cloudflare dashboard → R2 → Manage R2 API Tokens, Object Read & Write)

# dry run first — no upload, no writes
npm run ingest -- --section burning-man --dir ~/Photos/interfuse --tags interfuse,2025 --dry-run

# then for real
npm run ingest -- --section burning-man --dir ~/Photos/interfuse --tags interfuse,2025
```

Idempotent — re-running skips already-ingested photos, so curated alt text and tags
survive. Sections must exist in `src/content/sections.json`; tags must exist in
`src/content/tags.mjs`.

**Ingest stubs `alt` text and flags it.** Write real alt before considering a section
done — the build fails on empty `alt`.

---

## Deploying

Cloudflare Workers Builds is connected to this repo and deploys `main` automatically
(`npm run build` → `wrangler deploy`, serving `./dist`). **Just push to `main`.**

The Worker name in `wrangler.jsonc` is `curtiskline-github-io` and must stay that way —
it's the Worker the apex domain is routed to. It does not follow a repo rename.

Verify a push actually deployed — the repo connection has silently dropped before,
leaving pushes with no build and the previous version still live:

```bash
npx wrangler deployments list --name curtiskline-github-io
```

The newest entry should be newer than your push. If it isn't, check
**Workers & Pages → curtiskline-github-io → Settings → Builds** for a disconnected
repo or a failed build.

---

## Docs

- **[`docs/REBUILD-STATUS.md`](docs/REBUILD-STATUS.md)** — what's actually built, live
  infrastructure and IDs, decisions made along the way, gotchas, what's left. **Start here.**
- [`docs/REBUILD-HANDOFF.md`](docs/REBUILD-HANDOFF.md) — the original rebuild plan:
  why Astro, why Cloudflare, the gallery UX spec and cost budget.

---

## Credits

Design based on [Highlights](https://html5up.net/highlights) by
[HTML5 UP](https://html5up.net) / [@ajlkn](https://twitter.com/ajlkn), used under the
[CCA 3.0 license](https://html5up.net/license) (see `LICENSE.txt`). The original
template's jQuery, Font Awesome webfonts, and demo content have been replaced; the
visual design is retained.
