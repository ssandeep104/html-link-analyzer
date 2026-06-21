/**
 * Domain utilities for grouping links by their destination host.
 *
 * We deliberately avoid pulling in a full Public Suffix List (the npm `tldts`
 * package ships ~150 KB of data, which is overkill for our use case). Instead
 * we keep a small curated set of common multi-label public suffixes — anything
 * outside this set falls back to the last two labels, which is correct for
 * 99%+ of real-world hosts users will dump into the analyzer.
 *
 * If we ever need true PSL accuracy we can swap `registrableDomain` for
 * `tldts.getDomain` without changing the public API.
 */

/**
 * Common multi-label public suffixes. Add more as users report misgroupings.
 * Sorted longest-first to make the matcher greedy.
 */
const MULTI_LABEL_PUBLIC_SUFFIXES = new Set<string>([
  // UK
  "co.uk",
  "org.uk",
  "ac.uk",
  "gov.uk",
  "ltd.uk",
  "plc.uk",
  "me.uk",
  // Australia
  "com.au",
  "net.au",
  "org.au",
  "edu.au",
  "gov.au",
  "id.au",
  // New Zealand
  "co.nz",
  "net.nz",
  "org.nz",
  "govt.nz",
  // India
  "co.in",
  "net.in",
  "org.in",
  "gov.in",
  "ac.in",
  "edu.in",
  // Japan
  "co.jp",
  "ne.jp",
  "or.jp",
  "ac.jp",
  "go.jp",
  // South Africa
  "co.za",
  "org.za",
  "gov.za",
  "ac.za",
  // Brazil
  "com.br",
  "net.br",
  "org.br",
  "gov.br",
  "edu.br",
  // Mexico
  "com.mx",
  "gob.mx",
  "edu.mx",
  // Argentina
  "com.ar",
  "gov.ar",
  "edu.ar",
  // Singapore
  "com.sg",
  "edu.sg",
  "gov.sg",
  // Hong Kong
  "com.hk",
  "edu.hk",
  "gov.hk",
  // China
  "com.cn",
  "net.cn",
  "org.cn",
  "gov.cn",
  "edu.cn",
  // Korea
  "co.kr",
  "or.kr",
  "go.kr",
  "ac.kr",
  // Russia
  "com.ru",
  "net.ru",
  "org.ru",
  // Germany / generic
  "com.de",
  // Github & co. ship pages off these — treat them as suffixes so each
  // user/repo collapses to its own “domain”.
  "github.io",
  "gitlab.io",
  "pages.dev",
  "vercel.app",
  "netlify.app",
  "web.app",
  "firebaseapp.com",
  "blogspot.com",
  "wordpress.com",
  "tumblr.com",
  "medium.com",
  "substack.com",
  "notion.site",
  "readthedocs.io",
  "herokuapp.com",
  "appspot.com",
  "azurewebsites.net",
  "cloudfront.net",
]);

/**
 * Strip a literal leading `www.` (not a character-set strip — see classify.ts).
 */
export function stripWww(host: string): string {
  const h = host.toLowerCase();
  return h.startsWith("www.") ? h.slice(4) : h;
}

/**
 * Return the registrable domain for a hostname. Always returns lowercase.
 *
 * Examples:
 *   news.bbc.co.uk      -> bbc.co.uk
 *   www.example.com     -> example.com
 *   foo.github.io       -> foo.github.io  (github.io is on the suffix list)
 *   localhost           -> localhost
 *   192.168.1.1         -> 192.168.1.1
 */
export function registrableDomain(hostname: string): string {
  if (!hostname) return "";
  const host = hostname.toLowerCase();

  // IPv4 and bracketed IPv6 keep the literal form.
  if (/^\[.*\]$/.test(host)) return host;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return host;

  const labels = host.split(".").filter(Boolean);
  if (labels.length <= 1) return host;
  if (labels.length === 2) return labels.join(".");

  // Try the longest matching multi-label suffix first (3 labels, then 2).
  const last3 = labels.slice(-3).join(".");
  if (MULTI_LABEL_PUBLIC_SUFFIXES.has(last3) && labels.length >= 4) {
    return labels.slice(-4).join(".");
  }
  const last2 = labels.slice(-2).join(".");
  if (MULTI_LABEL_PUBLIC_SUFFIXES.has(last2)) {
    return labels.slice(-3).join(".");
  }

  return last2;
}

/**
 * Best-effort hostname extraction from any href-like string.
 * Returns "" for fragments, relative URLs, or otherwise unparseable input.
 *
 * The `base` (optional) lets us resolve relative URLs to the analyzed page's
 * host so links like `/about` group under the page's own domain.
 */
export function extractHost(href: string, base?: string): string {
  if (!href) return "";
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith("#")) return "";

  // Special protocols (mailto:, tel:, javascript:, ...): no host.
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    const lower = trimmed.toLowerCase();
    if (
      lower.startsWith("mailto:") ||
      lower.startsWith("tel:") ||
      lower.startsWith("sms:") ||
      lower.startsWith("javascript:") ||
      lower.startsWith("data:") ||
      lower.startsWith("blob:") ||
      lower.startsWith("file:")
    ) {
      return "";
    }
  }

  try {
    if (trimmed.startsWith("//")) {
      return new URL("https:" + trimmed).hostname.toLowerCase();
    }
    return new URL(trimmed).hostname.toLowerCase();
  } catch {
    // Relative URL: try resolving against base.
    if (base) {
      try {
        return new URL(trimmed, base).hostname.toLowerCase();
      } catch {
        /* fall through */
      }
    }
    return "";
  }
}
