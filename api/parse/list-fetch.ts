import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  extractUrls,
  fetchAndParseUrlList,
  safeFetch,
} from "@workspace/parser-core";

// This endpoint fans out to up to 20 page fetches; it needs the full
// Hobby-plan duration budget. (Configured here instead of vercel.json because
// per-file `functions` patterns don't match reliably.)
export const maxDuration = 60;

interface ParseListFetchBody {
  text?: string;
  source?: string | null;
}

const MAX_CHARS = 2 * 1024 * 1024; // 2 MiB of pasted text
const MAX_PAGES = 30; // raised temporarily from 20 for a larger-batch experiment;
// note: worst case (every page hanging) can now exceed the 60s serverless
// budget — typical runs finish far quicker
const CONCURRENCY = 5;
const FETCH_MAX_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 12_000;

/**
 * POST /api/parse/list-fetch
 *
 * Accepts a freeform multi-line dump of URLs, fetches every page one level
 * deep (SSRF + size guards via safeFetch), runs the link analyzer over each
 * page, and returns one combined ParseResult: all links merged (each stamped
 * with the page it came from via `page_url`) plus a `pages` breakdown with
 * per-page status / link counts / errors.
 *
 * A single dead page never fails the batch — it is recorded in `pages` with
 * status "error" and the rest of the analysis still goes through.
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = (req.body ?? {}) as ParseListFetchBody;
  const text = (body.text ?? "").toString();
  if (!text.trim()) {
    res.status(400).json({ error: "text is required" });
    return;
  }
  if (text.length > MAX_CHARS) {
    res.status(413).json({ error: "Pasted text is too large" });
    return;
  }

  const urls = extractUrls(text);
  if (urls.length === 0) {
    res.status(400).json({ error: "No URLs found in the pasted text" });
    return;
  }
  if (urls.length > MAX_PAGES) {
    res.status(400).json({
      error: `Too many URLs: found ${urls.length}, maximum is ${MAX_PAGES} per batch. Split the list and run it in parts.`,
    });
    return;
  }

  try {
    const { result } = await fetchAndParseUrlList(
      text,
      (url) =>
        safeFetch(url, {
          maxBytes: FETCH_MAX_BYTES,
          timeoutMs: FETCH_TIMEOUT_MS,
        }),
      {
        source: body.source ?? "url-list",
        maxPages: MAX_PAGES,
        concurrency: CONCURRENCY,
      },
    );
    res.status(200).json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Failed to fetch URL list: ${msg}` });
  }
}
