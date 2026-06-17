/**
 * HTML link extraction.
 *
 * Walks every <a> in the document, classifies, resolves, and groups by
 * semantic section + nearest preceding heading. Output shape matches the
 * `ParseResult` OpenAPI schema (lib/api-spec/openapi.yaml).
 */

import * as cheerio from "cheerio";
import { classifyLink, resolveHref, type LinkType } from "./classify.js";

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
}

export interface LinkMetrics {
  total: number;
  internal: number;
  external: number;
  anchor: number;
  special: number;
}

export interface HeadingGroup {
  heading: string | null;
  links: ParsedLink[];
}

export interface GroupedSection {
  section: string;
  headings: HeadingGroup[];
}

export interface ParseResult {
  source: string;
  base_url: string;
  links: ParsedLink[];
  metrics: LinkMetrics;
  grouped: GroupedSection[];
}

type CheerioAPI = ReturnType<typeof cheerio.load>;
// We only need .name / .attribs / .parent / .children for traversal logic.
// Cheerio's node types include Element, Text, Comment, etc.; we model the
// subset we actually touch with a structural type.
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
  // Determine container: the semantic section if found, else the document root
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
      // Cheerio's `$()` element-argument union is finicky to satisfy; we
      // cast through unknown — the runtime behavior is identical.
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
    });
  });

  const metrics: LinkMetrics = {
    total: links.length,
    internal: links.filter((l) => l.type === "internal").length,
    external: links.filter((l) => l.type === "external").length,
    anchor: links.filter((l) => l.type === "anchor").length,
    special: links.filter((l) => l.type === "special").length,
  };

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
  };
}
