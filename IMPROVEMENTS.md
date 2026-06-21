# html-link-analyzer — Improvement Plan

_Assessment from a fresh clone, June 2026. Updated as features land._

## ✅ Shipped
- **Domain-first grouping (June 2026)** — `parser-core` now attaches `host`/`domain` to every link, exposes `grouped_by_domain` and `unique_domains`, and the UI defaults to a Domain view with favicons, subdomain chips, and count histograms.
- **URL-list input mode (June 2026)** — new `parseUrlList()` + `POST /api/parse/list` endpoint accept a freeform multi-line URL dump (tolerant of bullets, numbering, markdown links). The new "URL List" tab is the default landing surface in the app.


## What the project is today

A **LinkScan** web app: paste a URL, upload an `.html` / `.htm`, or drop a Safari `.webarchive`, and get back every `<a>` tag in the document — classified (internal / external / anchor / special), grouped by semantic section + nearest heading, with CSV / JSON / self-contained-HTML export.

**Stack as cloned**
- `artifacts/link-parser` — React 19 + Vite + Tailwind + shadcn/Radix UI + wouter + TanStack Query
- `artifacts/api-server` — **two parallel backend implementations**:
  - `main.py` + `parser.py` — a real, working FastAPI service (BeautifulSoup + lxml, webarchive plist support)
  - `src/app.ts` + `routes/health.ts` — an Express 5 + pino + Orval-codegen skeleton with **only a `/healthz` endpoint** — no parse routes yet
- `lib/` — `api-spec` (OpenAPI), `api-zod`, `api-client-react` (codegen target), `db` (Drizzle, currently unused)
- pnpm workspaces, Node 24, TS 5.9, dark-mode-locked UI

## The single biggest issue: backend is bifurcated

The React app calls `useParseUrl` / `useParseFile` (codegen'd from the OpenAPI spec → wired to the Express server), but the actual parsing logic lives only in the FastAPI server. Either the Python service is the runtime and the TS server is dead code, or the TS server is the target and the Python is legacy. Until that's resolved, half the repo is dragging the other half.

**Recommendation:** pick one and delete the other.
- If you keep **Python/FastAPI**, drop `artifacts/api-server/src/**`, remove Express/pino/Orval deps, and have the frontend call FastAPI directly (still through the Orval-generated client — just point the OpenAPI spec at the FastAPI service, which can auto-emit one at `/openapi.json`).
- If you keep **TypeScript/Express**, port `parser.py` to TS using `node-html-parser` or `cheerio` + `plist` for webarchive, register `POST /api/parse/url` and `POST /api/parse/file` in `routes/`, and delete the Python files.

My vote: **keep TypeScript**, because the rest of the workspace (codegen, Zod, db, react-query hooks) is already TS-native and you lose nothing parsing-wise — `cheerio` matches BeautifulSoup almost 1:1.

---

## High-value improvements (ranked)

### 1. Make URL fetching production-safe
`main.py:parse_url` does an unrestricted server-side `requests.get(user_input)`. That's classic **SSRF**: anyone hitting your public endpoint can probe `http://169.254.169.254/`, `http://localhost:6379`, internal `10.x.x.x` ranges, etc.

Fix before you ever deploy this publicly:
- Resolve the hostname, reject if it maps to private / loopback / link-local / metadata ranges.
- Cap response size (e.g. 5 MB) — currently a 500 MB HTML body would OOM the box.
- Set a stricter timeout (15 s is fine; also add `read` timeout separately).
- Strip the redirect chain — `allow_redirects=True` re-opens the SSRF hole on each hop; re-validate every hop's resolved IP.
- Optional: queue these through a worker so a slow target page doesn't hold an HTTP connection.

### 2. Move parsing into the browser when you can
For URL inputs you need a server (CORS will block client-side fetches). But for **file uploads**, the user already has the bytes locally — parsing them client-side eliminates an entire round-trip, doubles privacy, and removes the need to base64-encode webarchives.
- Use `DOMParser` + a small `parseAnchors` helper for HTML.
- Use the `bplist-parser` / `plist` npm packages for `.webarchive` extraction directly in the browser.
- Keep the server endpoint as a fallback for `.webarchive` files >5 MB or for browsers without `DOMParser`.

### 3. Persistence & sharing (the actual product loop)
`lib/db` is wired up with Drizzle but unused. The natural next product step:
- Save each parse as a record (`id`, `source_url`, `parsed_at`, `metrics`, `links`).
- Give it a public read-only URL: `/r/:slug` → static rendered LinkViewer.
- Add a "My recent scans" list keyed by anonymous cookie or by future user auth.
- This turns a one-shot tool into something users come back to — and gives you a public-page SEO surface.

### 4. Bookmarklet / browser extension entry point
Given your original Replit framing as a "bookmark link generator", the killer UX is:
- A bookmarklet that, when clicked on any page, sends the current page's `document.documentElement.outerHTML` and `location.href` to LinkScan in a new tab.
- A small Chrome/Firefox MV3 extension that does the same with a toolbar icon, plus an option to right-click any element and scan only links beneath it.
- This is a one-day feature that completely changes the funnel — no more "copy URL, paste, click analyze".

### 5. Smarter link classification
The current classifier has small but visible gaps:
- `lstrip("www.")` is a **bug** — `lstrip` strips a *set of characters*, not a prefix. `"www.foo.com".lstrip("www.")` returns `"foo.com"` by coincidence, but `"wwx.foo.com".lstrip("www.")` returns `"x.foo.com"`. Use `removeprefix("www.")`.
- Treat `data:`, `blob:`, `file:`, `chrome-extension:` as their own category, not "special" lumped with `mailto:`.
- Surface **broken-link candidates**: missing `href`, `href="#"`, `href=""`, duplicate `href` on different anchors.
- Detect `rel="nofollow"`, `rel="sponsored"`, `rel="ugc"`, `target="_blank"` without `rel="noopener"` — these are the things SEO/security auditors actually want.
- Detect tracking params (`utm_*`, `fbclid`, `gclid`) and offer a "show cleaned URLs" toggle.

### 6. Resource extraction beyond `<a>`
The product is called "link analyzer" but only inspects anchors. Add a togglable layer for:
- `<img src>`, `<source srcset>` — image inventory + missing `alt` audit
- `<link rel>` — canonical, alternate, hreflang, RSS, manifests
- `<script src>`, `<link rel="stylesheet">` — third-party asset domains
- `<iframe src>`, `<form action>`

Even just reporting unique third-party domains across all of those is a useful "what is this page actually loading" view.

### 7. Crawl mode
Right now it's single-page. A "depth = 1 / same-origin" crawler that walks every internal link found and aggregates a site-wide link graph would be the natural step up — and it's a small leap from what's already there. Cap pages, respect `robots.txt`, show progress live via Server-Sent Events.

### 8. Frontend polish
- `<WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>` is fine for GitHub Pages but the app is locked to `/` — add at least a `/r/:slug` route now even if it 404s, so the routing shell is real.
- Dark mode is **forced** in `App.tsx` via `classList.add("dark")` on mount. Wrap it in `next-themes` (already installed!) so the user can choose. There's a `ThemeToggle` waiting to be written.
- The empty state's "Example Usage" is text — make those clickable demo URLs (e.g. `https://news.ycombinator.com`, `https://en.wikipedia.org/wiki/HTML`) that pre-fill and submit.
- Virtualize `LinkViewer` (use `@tanstack/react-virtual` — easy add) so pages with thousands of links don't lock the tab.
- The exported self-contained HTML report is great; add a "print to PDF" stylesheet and a copy-to-clipboard for individual rows.

### 9. Repo hygiene
- `replit.md` is still the **template** — never filled in. Replace with a real README at the repo root that names the project, shows a screenshot, lists `pnpm install` / `pnpm dev`, and links to the live Vercel deploy.
- No `LICENSE` despite `"license": "MIT"` in package.json. Add the actual MIT file.
- No CI. A single GitHub Actions workflow running `pnpm typecheck` + `pnpm build` on PR would catch 90% of regressions.
- No tests. The parser is the one place that desperately needs unit tests — give it 10–15 fixture HTML files and snapshot the JSON output.
- `.replit`, `.replitignore`, `@replit/vite-plugin-*` deps — if you're moving off Replit, prune these and shrink the lockfile.

### 10. Observability
The Express skeleton already imports `pino-http` — wire request IDs through to error responses (`X-Request-Id` header) so when a user reports a failed parse you can grep one ID across the logs. Add a `/api/version` endpoint that returns git SHA so the deployed build is always identifiable.

---

## Suggested 2-week roadmap

| Week | Theme | Deliverables |
|------|-------|--------------|
| 1 | Consolidate backend | Pick TS or Python, delete the other, port parser, restore typecheck-clean build, fill in `replit.md` → `README.md`, add SSRF protection + size cap. |
| 2 | Product loop | Persist scans to Drizzle/Postgres, public `/r/:slug` view, bookmarklet entry point, theme toggle, virtualize the link list. |

Anything past that (crawl mode, extension, resource extraction) is genuine v2 territory.
