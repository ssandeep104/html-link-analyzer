/**
 * Link classification utilities.
 *
 * A link belongs to exactly one of:
 *   - "internal"  – same registrable domain (or relative URL with no scheme)
 *   - "external"  – http(s) URL on a different domain
 *   - "anchor"    – fragment-only ("#section")
 *   - "special"   – mailto:, tel:, sms:, javascript:, data:, blob:, file:, …
 *
 * NOTE: The original Python implementation used `lstrip("www.")`, which is a
 * character-set strip, not a prefix strip — `"wwx.foo.com".lstrip("www.")`
 * incorrectly returns `"x.foo.com"`. We strip a literal "www." prefix here.
 */

export type LinkType = "internal" | "external" | "anchor" | "special";

const SPECIAL_PROTOCOLS = [
  "mailto:",
  "tel:",
  "sms:",
  "fax:",
  "javascript:",
  "data:",
  "blob:",
  "file:",
  "chrome-extension:",
  "moz-extension:",
  "ftp:",
  "magnet:",
];

const stripWwwPrefix = (host: string): string =>
  host.toLowerCase().startsWith("www.") ? host.slice(4) : host.toLowerCase();

export function classifyLink(href: string, baseHost: string): LinkType {
  if (!href || href.trim() === "") {
    return "special";
  }
  const trimmed = href.trim();

  if (trimmed.startsWith("#")) return "anchor";

  const lower = trimmed.toLowerCase();
  for (const proto of SPECIAL_PROTOCOLS) {
    if (lower.startsWith(proto)) return "special";
  }

  const sameOrSubdomain = (linkHost: string, base: string): boolean => {
    if (base === "") return false;
    if (linkHost === base) return true;
    // Only treat as subdomain when the prefix ends on a label boundary,
    // i.e. linkHost ends with "." + base. "wwx.foo.com" must NOT match "foo.com"
    // — but "blog.foo.com" must.
    return linkHost.endsWith("." + base);
  };

  // Protocol-relative URLs ("//example.com/foo")
  if (trimmed.startsWith("//")) {
    try {
      const u = new URL("https:" + trimmed);
      const linkHost = stripWwwPrefix(u.hostname);
      const base = stripWwwPrefix(baseHost);
      return sameOrSubdomain(linkHost, base) ? "internal" : "external";
    } catch {
      return "special";
    }
  }

  try {
    const u = new URL(trimmed);
    if (u.protocol === "http:" || u.protocol === "https:") {
      const linkHost = stripWwwPrefix(u.hostname);
      const base = stripWwwPrefix(baseHost);
      return sameOrSubdomain(linkHost, base) ? "internal" : "external";
    }
    // Some other parseable scheme we don't recognize as web traffic
    return "special";
  } catch {
    // Not an absolute URL → treat as relative / internal
    return "internal";
  }
}

/** Resolve `href` against `baseUrl`, falling back to the raw href on failure. */
export function resolveHref(href: string, baseUrl: string): string {
  if (!href) return href;
  const trimmed = href.trim();
  if (trimmed.startsWith("#")) return trimmed;
  const lower = trimmed.toLowerCase();
  for (const proto of SPECIAL_PROTOCOLS) {
    if (lower.startsWith(proto)) return trimmed;
  }
  if (!baseUrl) return trimmed;
  try {
    return new URL(trimmed, baseUrl).toString();
  } catch {
    return trimmed;
  }
}

const TRACKING_PARAM_PATTERNS = [
  /^utm_/i,
  /^fbclid$/i,
  /^gclid$/i,
  /^dclid$/i,
  /^msclkid$/i,
  /^mc_eid$/i,
  /^mc_cid$/i,
  /^yclid$/i,
  /^_ga$/i,
  /^ref$/i,
  /^ref_src$/i,
  /^igshid$/i,
];

export function hasTrackingParams(resolved: string): boolean {
  try {
    const u = new URL(resolved);
    for (const key of u.searchParams.keys()) {
      if (TRACKING_PARAM_PATTERNS.some((re) => re.test(key))) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function stripTrackingParams(resolved: string): string {
  try {
    const u = new URL(resolved);
    const toDelete: string[] = [];
    for (const key of u.searchParams.keys()) {
      if (TRACKING_PARAM_PATTERNS.some((re) => re.test(key))) toDelete.push(key);
    }
    toDelete.forEach((k) => u.searchParams.delete(k));
    return u.toString();
  } catch {
    return resolved;
  }
}
