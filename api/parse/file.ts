import type { VercelRequest, VercelResponse } from "@vercel/node";
import { extractWebArchive, parseHtml } from "@workspace/parser-core";

interface ParseFileBody {
  html_content?: string | null;
  file_content_b64?: string | null;
  filename?: string | null;
  base_url?: string | null;
}

const MAX_HTML_CHARS = 10 * 1024 * 1024; // 10M chars ≈ 10–40 MB depending on encoding
const MAX_B64_CHARS = 14 * 1024 * 1024; // ~10 MB decoded

/**
 * POST /api/parse/file
 *
 * Accepts either:
 *   - `html_content` for .html / .htm uploads, or
 *   - `file_content_b64` for binary formats (Safari `.webarchive`).
 *
 * Runs the link analyzer over the resulting HTML.
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

  const body = (req.body ?? {}) as ParseFileBody;
  const filename = body.filename?.trim() || "uploaded-file.html";
  const isWebArchive = filename.toLowerCase().endsWith(".webarchive");

  let html: string;
  let baseUrl = body.base_url?.trim() ?? "";

  try {
    if (isWebArchive) {
      const b64 = body.file_content_b64?.trim();
      if (!b64) {
        res
          .status(400)
          .json({ error: "file_content_b64 is required for .webarchive files" });
        return;
      }
      if (b64.length > MAX_B64_CHARS) {
        res.status(413).json({ error: "Uploaded file is too large" });
        return;
      }
      const buf = Buffer.from(b64, "base64");
      const extracted = extractWebArchive(buf);
      html = extracted.html;
      if (!baseUrl) baseUrl = extracted.baseUrl;
    } else {
      const content = body.html_content;
      if (!content || !content.trim()) {
        res
          .status(400)
          .json({ error: "html_content is required for HTML files" });
        return;
      }
      if (content.length > MAX_HTML_CHARS) {
        res.status(413).json({ error: "Uploaded file is too large" });
        return;
      }
      html = content;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(422).json({ error: msg });
    return;
  }

  try {
    const parsed = parseHtml(html, { source: filename, baseUrl });
    res.status(200).json(parsed);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `Failed to parse HTML: ${msg}` });
  }
}
