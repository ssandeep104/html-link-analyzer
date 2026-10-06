/**
 * Batch (URL-list) fetch-and-analyze.
 *
 * Fetches every URL in a freeform list one level deep — each page is fetched
 * and its own links are extracted (we do NOT follow the discovered links).
 * Per-page outcomes are recorded individually so one dead page never sinks
 * the whole batch, and the successful pages are merged into a single
 * `ParseResult` with every link stamped with the page it came from
 * (`page_url`) plus a `pages` breakdown.
 *
 * The actual HTTP fetch is injected (`FetchPageFn`) so this stays pure and
 * unit-testable; the API layer passes `safeFetch`.
 */

import {
  buildDomainGroups,
  computeMetrics,
  extractUrls,
  parseHtml,
  type PageAnalysis,
  type ParsedLink,
  type ParseResult,
} from "./parser.js";

/** Minimal page-fetch contract. Matches `safeFetch`'s result shape. */
export interface PageFetch {
  body: string;
  finalUrl: string;
  truncated: boolean;
}

export type FetchPageFn = (url: string) => Promise<PageFetch>;

export interface FetchAndParseOptions {
  /** Identifier surfaced in the result; defaults to "url-list". */
  source?: string;
  /** Max pages to fetch in one call. Defaults to 30. */
  maxPages?: number;
  /** Simultaneous in-flight fetches. Defaults to 5. */
  concurrency?: number;
}

export interface BatchOutcome {
  /** Combined analysis across all successfully fetched pages. */
  result: ParseResult;
  /** Number of URLs in the list that were skipped because of maxPages. */
  skipped: number;
}

const DEFAULT_MAX_PAGES = 30;
const DEFAULT_CONCURRENCY = 5;

/**
 * Normalize a list entry into something fetchable. Returns null for entries
 * that can never be fetched (relative paths without a base, mailto:, etc.).
 */
function normalizeFetchUrl(raw: string): { url: string } | { skip: string } {
  let url = raw.trim();
  if (!/^https?:\/\//i.test(url)) {
    // Tolerate bare hosts like "example.com" the same way the URL tab does.
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(url) || /^www\./i.test(url)) {
      url = "https://" + url;
    } else {
      return { skip: "Not an http(s) URL — only web pages can be fetched" };
    }
  }
  return { url };
}

interface SettledPage {
  analysis: PageAnalysis;
  /** Full per-page parse result, present only when the fetch succeeded. */
  parsed: ParseResult | null;
}

export async function fetchAndParseUrlList(
  text: string,
  fetchPage: FetchPageFn,
  opts: FetchAndParseOptions = {},
): Promise<BatchOutcome> {
  const source = opts.source ?? "url-list";
  const maxPages = Math.max(1, opts.maxPages ?? DEFAULT_MAX_PAGES);
  const concurrency = Math.max(1, opts.concurrency ?? DEFAULT_CONCURRENCY);

  const entries = extractUrls(text);
  const taken = entries.slice(0, maxPages);
  const skipped = entries.length - taken.length;

  const settled: SettledPage[] = new Array(taken.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (next < taken.length) {
      const i = next;
      next += 1;
      const entry = taken[i]!;
      const normalized = normalizeFetchUrl(entry.url);
      if ("skip" in normalized) {
        settled[i] = {
          analysis: { url: entry.url, status: "error", error: normalized.skip },
          parsed: null,
        };
        continue;
      }
      const url = normalized.url;
      try {
        const fetched = await fetchPage(url);
        const parsed = parseHtml(fetched.body, {
          source: fetched.finalUrl,
          baseUrl: fetched.finalUrl,
        });
        settled[i] = {
          analysis: {
            url,
            status: "ok",
            final_url: fetched.finalUrl,
            links: parsed.links.length,
            truncated: fetched.truncated,
          },
          parsed,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const code =
          err instanceof Error && "code" in err && typeof (err as { code: unknown }).code === "string"
            ? (err as { code: string }).code
            : undefined;
        settled[i] = {
          analysis: { url, status: "error", error: msg, ...(code ? { code } : {}) },
          parsed: null,
        };
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, taken.length) },
    () => worker(),
  );
  await Promise.all(workers);

  // Merge every page's links into one result, stamping each with its page.
  const links: ParsedLink[] = [];
  let id = 0;
  for (const s of settled) {
    if (!s.parsed) continue;
    for (const link of s.parsed.links) {
      id += 1;
      links.push({ ...link, id, page_url: s.analysis.url });
    }
  }

  const result: ParseResult = {
    source: `${source} — ${settled.filter((s) => s.parsed).length}/${settled.length} pages fetched`,
    base_url: "",
    links,
    metrics: computeMetrics(links),
    grouped: [], // per-page section groupings don't merge meaningfully
    grouped_by_domain: buildDomainGroups(links),
    pages: settled.map((s) => s.analysis),
  };

  return { result, skipped };
}
