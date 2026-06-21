/**
 * HTML link extraction + domain grouping.
 *
 * Two entry points:
 *   - `parseHtml(html, opts)` walks every <a> in a document, classifies each
 *     link, attaches its semantic section + nearest preceding heading, and
 *     groups results both by section→heading (legacy) and by destination
 *     domain (the headline view).
 *   - `parseUrlList(text, opts)` accepts a freeform multi-line dump of URLs
 *     (one per line, tolerant of bullets, markdown links, surrounding
 *     whitespace) and produces the same `ParseResult` shape — without any
 *     DOM. Section/heading are null on every link in this mode.
 */

import * as cheerio from "cheerio";
import { classifyLink, resolveHref, type LinkType } from "./classify.js";
import { extractHost, registrableDomain, stripWww } from "./domain.js";

const SEMANTIC_TAGS = new Set([
  "header",
  "nav",
  "footer",
  "aside",
  "main",
  "section",
  "article",
]);

const SEMANTIC_CLASS_RE =
  /\b(header|nav|footer|aside|main|sidebar|hero|content|article|section)\b/i;

const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

export interface ParsedLink {
  id: number;
  text: string;
  href: string;
  resolved_href: string;
  type: LinkType;
  section: string | null;
  heading: string | null;
  position: number;
  /** Full hostname of the resolved URL (lowercased, with subdomain). "" if not applicable. */
  host: string;
  /** Registrable domain, e.g. "bbc.co.uk" for "news.bbc.co.uk". "" if not applicable. */
  domain: string;
}

export interface LinkMetrics {
  total: number;
  internal: number;
  external: number;
  anchor: number;
  special: number;
  /** Number of distinct registrable domains across all links. */
  unique_domains: number;
}

export interface HeadingGroup {
  heading: string | null;
  links: ParsedLink[];
}

export interface GroupedSection {
  section: string;
  headings: HeadingGroup[];
}

export interface DomainGroup {
  /** Registrable domain ("" bucket holds anchors / mailto / unparseable links). */
  domain: string;
  /** Hosts seen under this domain (e.g. ["api.github.com", "github.com"]). */
  hosts: string[];
  count: number;
  links: ParsedLink[];
}

export interface ParseResult {
  source: string;
  base_url: string;
  links: ParsedLink[];
  metrics: LinkMetrics;
  /** Section → heading → links. Empty for `parseUrlList()` results. */
  grouped: GroupedSection[];
  /** Domain → links, sorted by count desc then domain asc. */
  grouped_by_domain: DomainGroup[];
}

type CheerioAPI = ReturnType<typeof cheerio.load>;
type AnyNode = {
  name?: string;
  attribs?: Record<string, string>;
  parent?: AnyNode | null;
  children?: AnyNode[];
};

function findSemanticSection($: CheerioAPI, element: AnyNode): {
  name: string;
  node: AnyNode | null;
} {
  let node: AnyNode | null = element.parent as AnyNode | null;
  while (node && (node as { name?: string }).name) {
    const tag = (node as { name?: string }).name?.toLowerCase() ?? "";
    if (SEMANTIC_TAGS.has(tag)) {
      return { name: tag, node };
    }
    const attribs = (node as { attribs?: Record<string, string> }).attribs ?? {};
    const combined = `${attribs["class"] ?? ""} ${attribs["id"] ?? ""}`;
    const match = combined.match(SEMANTIC_CLASS_RE);
    if (match) {
      return { name: match[1]!.toLowerCase(), node };
    }
    node = (node as { parent?: AnyNode }).parent ?? null;
  }
  return { name: "body", node: null };
}

function findPrecedingHeading(
  $: CheerioAPI,
  element: AnyNode,
  sectionNode: AnyNode | null,
): string | null {
  const container: AnyNode = sectionNode ?? ($.root()[0] as unknown as AnyNode);
  let lastHeading: string | null = null;
  let found = false;

  const walk = (node: AnyNode): void => {
    if (found) return;
    if (node === element) {
      found = true;
      return;
    }
    const tag = node.name?.toLowerCase() ?? "";
    if (HEADING_TAGS.has(tag)) {
      const text = $(node as unknown as never).text().trim();
      if (text) lastHeading = text;
    }
    const children = node.children ?? [];
    for (const child of children) {
      walk(child);
      if (found) return;
    }
  };

  walk(container);
  return lastHeading;
}

/** Group a flat link array by registrable domain, sorted by count desc. */
function buildDomainGroups(links: ParsedLink[]): DomainGroup[] {
  const map = new Map<string, { hosts: Set<string>; links: ParsedLink[] }>();
  for (const link of links) {
    const key = link.domain;
    if (!map.has(key)) map.set(key, { hosts: new Set(), links: [] });
    const entry = map.get(key)!;
    if (link.host) entry.hosts.add(link.host);
    entry.links.push(link);
  }
  const groups: DomainGroup[] = [];
  for (const [domain, { hosts, links: ls }] of map) {
    groups.push({
      domain,
      hosts: Array.from(hosts).sort(),
      count: ls.length,
      links: ls,
    });
  }
  groups.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    // Empty-domain bucket sinks to the bottom.
    if (a.domain === "" && b.domain !== "") return 1;
    if (b.domain === "" && a.domain !== "") return -1;
    return a.domain.localeCompare(b.domain);
  });
  return groups;
}

function computeMetrics(links: ParsedLink[]): LinkMetrics {
  const distinctDomains = new Set<string>();
  for (const l of links) if (l.domain) distinctDomains.add(l.domain);
  return {
    total: links.length,
    internal: links.filter((l) => l.type === "internal").length,
    external: links.filter((l) => l.type === "external").length,
    anchor: links.filter((l) => l.type === "anchor").length,
    special: links.filter((l) => l.type === "special").length,
    unique_domains: distinctDomains.size,
  };
}

export interface ParseHtmlOptions {
  /** Identifier surfaced in the result; usually the URL or filename. */
  source: string;
  /** Base URL for resolving relative hrefs. */
  baseUrl: string;
}

export function parseHtml(htmlContent: string, opts: ParseHtmlOptions): ParseResult {
  const $ = cheerio.load(htmlContent);

  let baseHost = "";
  try {
    if (opts.baseUrl) baseHost = new URL(opts.baseUrl).hostname;
  } catch {
    baseHost = "";
  }

  const links: ParsedLink[] = [];
  let position = 0;

  $("a").each((_, el) => {
    const $el = $(el);
    const href = ($el.attr("href") ?? "").trim();
    const text = $el.text().replace(/\s+/g, " ").trim();

    const resolved = resolveHref(href, opts.baseUrl);
    const type = classifyLink(href, baseHost);
    const { name: sectionName, node: sectionNode } = findSemanticSection(
      $,
      el as unknown as AnyNode,
    );
    const heading = findPrecedingHeading($, el as unknown as AnyNode, sectionNode);
    const host = extractHost(resolved, opts.baseUrl);
    const domain = host ? registrableDomain(stripWww(host)) : "";

    position += 1;
    links.push({
      id: position,
      text,
      href,
      resolved_href: resolved,
      type,
      section: sectionName,
      heading,
      position,
      host,
      domain,
    });
  });

  const metrics = computeMetrics(links);

  // Group: section → heading → links
  const sectionsMap = new Map<string, Map<string, ParsedLink[]>>();
  for (const link of links) {
    const sec = link.section ?? "body";
    const key = link.heading ?? "__none__";
    if (!sectionsMap.has(sec)) sectionsMap.set(sec, new Map());
    const headings = sectionsMap.get(sec)!;
    if (!headings.has(key)) headings.set(key, []);
    headings.get(key)!.push(link);
  }

  const grouped: GroupedSection[] = [];
  for (const [sec, headings] of sectionsMap) {
    const headingsList: HeadingGroup[] = [];
    for (const [key, ls] of headings) {
      headingsList.push({
        heading: key === "__none__" ? null : key,
        links: ls,
      });
    }
    grouped.push({ section: sec, headings: headingsList });
  }

  return {
    source: opts.source,
    base_url: opts.baseUrl,
    links,
    metrics,
    grouped,
    grouped_by_domain: buildDomainGroups(links),
  };
}

// ---------------------------------------------------------------------------
// URL-list mode
// ---------------------------------------------------------------------------

export interface ParseUrlListOptions {
  /** Identifier surfaced in the result. */
  source?: string;
  /**
   * Optional base URL for resolving relative entries. Most URL dumps are
   * already absolute, but bookmark exports / copy-pastes sometimes include
   * `/path` entries that we want to attach to a known origin.
   */
  baseUrl?: string;
}

/**
 * Extract one URL per non-empty line, tolerant of common dump formats:
 *   - leading bullets / numbering: "- foo", "* foo", "1. foo"
 *   - markdown links: "[label](https://example.com)"
 *   - surrounding whitespace, quotes, angle brackets
 *   - inline comments after `#` only when the URL doesn't have a fragment
 *     (we deliberately keep `https://x.com/#section` intact)
 *   - lines containing more than one URL → take the first
 */
const MARKDOWN_LINK_RE = /\[[^\]]*\]\(([^)\s]+)\)/;
const ANY_URL_RE = /\b((?:https?:\/\/|\/\/)[^\s<>"')]+|(?:mailto|tel|sms):[^\s<>"')]+)/i;

function extractUrlFromLine(rawLine: string): { url: string; text: string } | null {
  let line = rawLine.trim();
  if (!line) return null;
  // Strip leading bullets / numbering / quotes
  line = line.replace(/^[\s>*\-•·]+/, "");
  line = line.replace(/^\d+[.)]\s+/, "");
  line = line.replace(/^["'<]+|["'>]+$/g, "");

  // 1. Markdown link form takes priority — preserves label text.
  const md = line.match(MARKDOWN_LINK_RE);
  if (md && md[1]) {
    const label = line.slice(line.indexOf("[") + 1, line.indexOf("]"));
    return { url: md[1].trim(), text: label.trim() || md[1].trim() };
  }

  // 2. Otherwise: first URL-looking token on the line.
  const m = line.match(ANY_URL_RE);
  if (m && m[1]) {
    return { url: m[1].trim(), text: line };
  }

  // 3. Bare hostnames / paths that look URL-ish: starts with "www." or has a TLD
  //    and no spaces. We add "https://" for hosts; bare paths stay as-is.
  if (!line.includes(" ")) {
    if (/^www\./i.test(line)) return { url: "https://" + line, text: line };
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(line)) {
      return { url: "https://" + line, text: line };
    }
    if (line.startsWith("/")) return { url: line, text: line };
  }
  return null;
}

export function parseUrlList(
  text: string,
  opts: ParseUrlListOptions = {},
): ParseResult {
  const source = opts.source ?? "url-list";
  const baseUrl = opts.baseUrl ?? "";

  let baseHost = "";
  try {
    if (baseUrl) baseHost = new URL(baseUrl).hostname;
  } catch {
    baseHost = "";
  }

  const links: ParsedLink[] = [];
  const seenResolved = new Set<string>();
  let position = 0;

  for (const rawLine of text.split(/\r?\n/)) {
    const entry = extractUrlFromLine(rawLine);
    if (!entry) continue;

    const href = entry.url;
    const resolved = resolveHref(href, baseUrl);
    // Skip exact dupes — bookmark dumps repeat constantly.
    if (seenResolved.has(resolved)) continue;
    seenResolved.add(resolved);

    const type = classifyLink(href, baseHost);
    const host = extractHost(resolved, baseUrl);
    const domain = host ? registrableDomain(stripWww(host)) : "";

    position += 1;
    links.push({
      id: position,
      text: entry.text === entry.url ? "" : entry.text,
      href,
      resolved_href: resolved,
      type,
      section: null,
      heading: null,
      position,
      host,
      domain,
    });
  }

  return {
    source,
    base_url: baseUrl,
    links,
    metrics: computeMetrics(links),
    grouped: [], // not meaningful without a DOM
    grouped_by_domain: buildDomainGroups(links),
  };
}
