import type { VercelRequest, VercelResponse } from "@vercel/node";
import { parseHtml, safeFetch, SafeFetchError } from "@workspace/parser-core";

interface ParseUrlBody {
  url?: string;
}

const MAX_BYTES = 5 * 1024 * 1024; // 5 MiB
const TIMEOUT_MS = 12_000;

/**
 * POST /api/parse/url
 *
 * Fetches the given URL safely (with SSRF + size guards) and runs the link
 * analyzer over the returned HTML.
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

  const body = (req.body ?? {}) as ParseUrlBody;
  let rawUrl = (body.url ?? "").trim();
  if (!rawUrl) {
    res.status(400).json({ error: "URL is required" });
    return;
  }
  if (!/^https?:\/\//i.test(rawUrl)) {
    rawUrl = "https://" + rawUrl;
  }

  try {
    const fetched = await safeFetch(rawUrl, {
      maxBytes: MAX_BYTES,
      timeoutMs: TIMEOUT_MS,
    });

    const parsed = parseHtml(fetched.body, {
      source: fetched.finalUrl,
      baseUrl: fetched.finalUrl,
    });

    res.status(200).json({
      ...parsed,
      truncated: fetched.truncated,
    });
  } catch (err) {
    if (err instanceof SafeFetchError) {
      const status =
        err.code === "BLOCKED_HOST" || err.code === "INVALID_URL" ? 400 : 422;
      res.status(status).json({ error: err.message, code: err.code });
      return;
    }
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Unexpected error: ${msg}` });
  }
}
