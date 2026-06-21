import type { VercelRequest, VercelResponse } from "@vercel/node";
import { parseUrlList } from "@workspace/parser-core";

interface ParseListBody {
  text?: string;
  source?: string | null;
  base_url?: string | null;
}

const MAX_CHARS = 2 * 1024 * 1024; // 2 MiB of pasted text — far more than any realistic URL dump

/**
 * POST /api/parse/list
 *
 * Accepts a freeform multi-line dump of URLs and groups them by domain.
 *
 * The frontend parses URL lists client-side as the default path (no network
 * round-trip needed — there's no HTML to fetch). This endpoint exists so the
 * OpenAPI contract is complete and so non-browser clients can hit it too.
 */
export default function handler(
  req: VercelRequest,
  res: VercelResponse,
): void {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = (req.body ?? {}) as ParseListBody;
  const text = (body.text ?? "").toString();
  if (!text.trim()) {
    res.status(400).json({ error: "text is required" });
    return;
  }
  if (text.length > MAX_CHARS) {
    res.status(413).json({ error: "Pasted text is too large" });
    return;
  }

  try {
    const result = parseUrlList(text, {
      source: body.source ?? "url-list",
      baseUrl: body.base_url ?? "",
    });
    res.status(200).json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Failed to parse URL list: ${msg}` });
  }
}
