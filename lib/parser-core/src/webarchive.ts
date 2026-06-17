/**
 * Safari .webarchive (binary plist) → HTML extraction.
 *
 * A .webarchive is an Apple binary property list (`bplist00…`) containing
 * a WebMainResource dictionary with the page HTML, its MIME type, the
 * text encoding, and the original URL.
 */

import bplist from "bplist-parser";

export interface WebArchiveContent {
  html: string;
  baseUrl: string;
}

interface WebMainResource {
  WebResourceData?: Buffer;
  WebResourceMIMEType?: string;
  WebResourceTextEncodingName?: string;
  WebResourceURL?: string;
}

interface WebArchivePlist {
  WebMainResource?: WebMainResource;
}

/**
 * Parse a .webarchive byte buffer and extract the main HTML resource.
 *
 * Throws an Error with a user-facing message on any structural problem.
 */
export function extractWebArchive(data: Buffer): WebArchiveContent {
  let parsed: unknown;
  try {
    parsed = bplist.parseBuffer(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not parse .webarchive as a binary plist: ${msg}`);
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("Empty or malformed .webarchive plist");
  }

  const plistRoot = parsed[0] as WebArchivePlist;
  const main = plistRoot.WebMainResource;
  if (!main) {
    throw new Error("No WebMainResource found in the .webarchive file");
  }

  const mime = main.WebResourceMIMEType ?? "";
  if (mime && !mime.startsWith("text/html")) {
    throw new Error(
      `Main resource MIME type is '${mime}', expected text/html`,
    );
  }

  const rawData = main.WebResourceData;
  if (!rawData || !Buffer.isBuffer(rawData)) {
    throw new Error("WebResourceData is missing or not a buffer");
  }

  const encoding = (main.WebResourceTextEncodingName ?? "utf-8").toLowerCase();
  let html: string;
  try {
    // Node's TextDecoder accepts a wide range of labels; fall back to utf-8.
    html = new TextDecoder(encoding, { fatal: false }).decode(rawData);
  } catch {
    html = new TextDecoder("utf-8", { fatal: false }).decode(rawData);
  }

  return {
    html,
    baseUrl: main.WebResourceURL ?? "",
  };
}
