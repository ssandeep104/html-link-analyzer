/**
 * SSRF-resistant HTTP fetcher.
 *
 * Performs a URL fetch where every redirect hop is independently validated
 * against an IP blocklist (loopback, link-local, private RFC1918,
 * cloud-metadata, etc.). Also enforces a max body size and a hard timeout.
 *
 * Designed for server-side use only.
 */

import dns from "node:dns/promises";
import net from "node:net";

export interface SafeFetchOptions {
  /** Hard cap on total elapsed milliseconds. Default: 12_000. */
  timeoutMs?: number;
  /** Max body bytes to read. Bytes past this are discarded. Default: 5 MiB. */
  maxBytes?: number;
  /** Max redirect hops to follow. Default: 5. */
  maxRedirects?: number;
  /** User-agent to send. */
  userAgent?: string;
}

export interface SafeFetchResult {
  finalUrl: string;
  status: number;
  body: string;
  truncated: boolean;
}

export class SafeFetchError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "INVALID_URL"
      | "BLOCKED_HOST"
      | "DNS_FAILURE"
      | "TIMEOUT"
      | "TOO_MANY_REDIRECTS"
      | "HTTP_ERROR"
      | "NETWORK_ERROR",
  ) {
    super(message);
    this.name = "SafeFetchError";
  }
}

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (compatible; LinkScan/1.0; +https://github.com/ssandeep104/html-link-analyzer)";

const PRIVATE_V4_CIDRS: Array<[string, number]> = [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // RFC1918
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local (covers AWS / GCP metadata 169.254.169.254)
  ["172.16.0.0", 12], // RFC1918
  ["192.0.0.0", 24], // IETF protocol
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.168.0.0", 16], // RFC1918
  ["198.18.0.0", 15], // benchmark
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved
  ["255.255.255.255", 32], // broadcast
];

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".").map(Number);
  return ((parts[0]! << 24) >>> 0) + (parts[1]! << 16) + (parts[2]! << 8) + parts[3]!;
}

function isPrivateIPv4(ip: string): boolean {
  const ipInt = ipv4ToInt(ip);
  for (const [base, prefix] of PRIVATE_V4_CIDRS) {
    const baseInt = ipv4ToInt(base);
    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    if ((ipInt & mask) === (baseInt & mask)) return true;
  }
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::" || lower === "::1") return true; // unspecified, loopback
  // ::ffff:a.b.c.d  – IPv4-mapped, defer to IPv4 check
  if (lower.startsWith("::ffff:")) {
    const v4 = lower.slice(7);
    if (net.isIPv4(v4)) return isPrivateIPv4(v4);
  }
  // fe80::/10 link-local, fc00::/7 unique-local, ff00::/8 multicast
  if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("ff")) return true;
  return false;
}

async function assertPublicHost(hostname: string): Promise<void> {
  // Direct IP literal in URL — check it and skip DNS.
  if (net.isIP(hostname)) {
    if (net.isIPv4(hostname) && isPrivateIPv4(hostname)) {
      throw new SafeFetchError(
        `URL resolves to a non-public address (${hostname})`,
        "BLOCKED_HOST",
      );
    }
    if (net.isIPv6(hostname) && isPrivateIPv6(hostname)) {
      throw new SafeFetchError(
        `URL resolves to a non-public address (${hostname})`,
        "BLOCKED_HOST",
      );
    }
    return;
  }

  let addrs: Array<{ address: string; family: number }>;
  try {
    addrs = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new SafeFetchError(`DNS lookup failed for ${hostname}: ${msg}`, "DNS_FAILURE");
  }

  for (const a of addrs) {
    if (a.family === 4 && isPrivateIPv4(a.address)) {
      throw new SafeFetchError(
        `URL host ${hostname} resolves to a non-public address (${a.address})`,
        "BLOCKED_HOST",
      );
    }
    if (a.family === 6 && isPrivateIPv6(a.address)) {
      throw new SafeFetchError(
        `URL host ${hostname} resolves to a non-public address (${a.address})`,
        "BLOCKED_HOST",
      );
    }
  }
}

/**
 * Parse + validate the URL: must be http(s), must have a hostname, scheme
 * must be present, host must be public.
 */
async function validateUrl(rawUrl: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new SafeFetchError(`Invalid URL: ${rawUrl}`, "INVALID_URL");
  }

  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new SafeFetchError(
      `Only http(s) URLs are allowed (got ${u.protocol})`,
      "INVALID_URL",
    );
  }
  if (!u.hostname) {
    throw new SafeFetchError("URL is missing a hostname", "INVALID_URL");
  }
  await assertPublicHost(u.hostname);
  return u;
}

/**
 * SSRF-safe URL fetcher. Follows redirects manually, revalidating every hop.
 */
export async function safeFetch(
  rawUrl: string,
  opts: SafeFetchOptions = {},
): Promise<SafeFetchResult> {
  const timeoutMs = opts.timeoutMs ?? 12_000;
  const maxBytes = opts.maxBytes ?? 5 * 1024 * 1024;
  const maxRedirects = opts.maxRedirects ?? 5;
  const userAgent = opts.userAgent ?? DEFAULT_USER_AGENT;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let currentUrl = await validateUrl(rawUrl);

    for (let hop = 0; hop <= maxRedirects; hop++) {
      const response = await fetch(currentUrl.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": userAgent,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
        },
      });

      // Manual redirect handling so we can revalidate each hop.
      if (response.status >= 300 && response.status < 400) {
        const loc = response.headers.get("location");
        if (!loc) {
          throw new SafeFetchError(
            `Redirect status ${response.status} with no Location header`,
            "HTTP_ERROR",
          );
        }
        if (hop === maxRedirects) {
          throw new SafeFetchError(
            `Exceeded maximum of ${maxRedirects} redirects`,
            "TOO_MANY_REDIRECTS",
          );
        }
        currentUrl = await validateUrl(new URL(loc, currentUrl).toString());
        continue;
      }

      if (!response.ok) {
        throw new SafeFetchError(
          `HTTP ${response.status} from ${currentUrl}`,
          "HTTP_ERROR",
        );
      }

      // Enforce body size cap by streaming.
      const reader = response.body?.getReader();
      if (!reader) {
        const text = await response.text();
        return {
          finalUrl: currentUrl.toString(),
          status: response.status,
          body: text.slice(0, maxBytes),
          truncated: text.length > maxBytes,
        };
      }

      const chunks: Uint8Array[] = [];
      let total = 0;
      let truncated = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          // Push the partial slice that still fits, then stop.
          const overflow = total - maxBytes;
          const take = value.byteLength - overflow;
          if (take > 0) chunks.push(value.subarray(0, take));
          truncated = true;
          try {
            await reader.cancel();
          } catch {
            // ignore
          }
          break;
        }
        chunks.push(value);
      }

      const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
      // Best-effort decode using the response's charset; default utf-8.
      const contentType = response.headers.get("content-type") ?? "";
      const charsetMatch = contentType.match(/charset=([^;]+)/i);
      const charset = charsetMatch?.[1]?.trim().toLowerCase() ?? "utf-8";
      let body: string;
      try {
        body = new TextDecoder(charset, { fatal: false }).decode(buf);
      } catch {
        body = new TextDecoder("utf-8", { fatal: false }).decode(buf);
      }

      return {
        finalUrl: currentUrl.toString(),
        status: response.status,
        body,
        truncated,
      };
    }
    throw new SafeFetchError("Unreachable redirect loop", "TOO_MANY_REDIRECTS");
  } catch (err) {
    if (err instanceof SafeFetchError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new SafeFetchError(`Request timed out after ${timeoutMs}ms`, "TIMEOUT");
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new SafeFetchError(`Network error: ${msg}`, "NETWORK_ERROR");
  } finally {
    clearTimeout(timer);
  }
}
