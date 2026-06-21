# html-link-analyzer

A web app that parses HTML documents, webarchive bundles, and freeform URL dumps to surface, classify, and audit every hyperlink they contain. Paste a list of URLs, fetch a single URL, or upload a file — results are grouped by **destination domain** by default, with section/heading grouping available for HTML inputs.

### Inputs
- **URL list** — paste a multi-line dump of URLs (one per line). Tolerates bullets, numbering, and `[label](url)` markdown links. No DOM required.
- **URL** — fetch a single page server-side (SSRF-hardened) and analyze it.
- **File** — upload `.html`, `.htm`, or Safari `.webarchive`.

### Views
- **Domain** (default) — links grouped by registrable domain, sorted by frequency, with subdomain breakdown and per-domain count bars.
- **Section** — semantic-section → nearest-heading grouping for HTML inputs.
- **Table** — flat sortable view with the new `domain` column.

Live demo: deployed on Vercel (see the project's `vercel.json`).

## Architecture

- **Frontend (`artifacts/link-parser`)** — Vite + React 19 + Tailwind v4 + Radix UI + TanStack Query. Single-page app served as static assets by Vercel.
- **API (`api/`)** — Vercel serverless functions on the `@vercel/node` runtime:
  - `GET  /api/healthz` — liveness check
  - `POST /api/parse/url` — fetches a URL with SSRF protection and parses its HTML
  - `POST /api/parse/file` — parses an uploaded HTML file or `.webarchive` bundle
- **Shared parser (`lib/parser-core`)** — pure TypeScript: cheerio for HTML, custom bplist reader for webarchive payloads, classifier that flags tracking params and unsafe `target="_blank"` patterns. 30 unit tests under vitest.
- **OpenAPI contract (`lib/api-spec`)** — drives Orval-generated React Query hooks (`lib/api-client-react`) and Zod schemas (`lib/api-zod`) consumed by the frontend.

## Local development

Requires Node 20+ and pnpm 9.

```bash
pnpm install
pnpm run typecheck                  # full workspace typecheck
pnpm --filter @workspace/parser-core test
pnpm --filter @workspace/link-parser run dev
```

The frontend dev server proxies `/api/*` calls to the deployed Vercel functions during development; for a fully local API, use `vercel dev` from the repo root after authenticating with the Vercel CLI.

## Deploying

This repo is configured for one-command Vercel deploys via `vercel.json`:

- Build command: `pnpm --filter @workspace/link-parser run build`
- Output directory: `artifacts/link-parser/dist`
- Functions: `api/**/*.ts` on `@vercel/node@3.2.29`, 1024 MB memory, 15 s `maxDuration`

To deploy, connect this repository to Vercel and push to the default branch — every push to `main` produces a production deployment; every PR gets a preview URL.

## Security posture

- `api/parse/url` uses an SSRF-hardened fetcher: blocklists all private/loopback/link-local IPv4 and IPv6 ranges (including AWS metadata `169.254.169.254`), enforces a 5 MiB body cap, a 12 s timeout, and revalidates the target host on every redirect hop.
- File uploads are accepted only as `text/html` or Safari `.webarchive` (binary plist) blobs, hard-capped at 5 MiB.
- Supply-chain defense: pnpm `minimumReleaseAge: 1440` blocks installation of npm packages younger than 1 day.

## License

[MIT](./LICENSE).
