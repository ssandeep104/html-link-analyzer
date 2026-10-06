export {
  classifyLink,
  resolveHref,
  hasTrackingParams,
  stripTrackingParams,
  type LinkType,
} from "./classify.js";
export {
  parseHtml,
  parseUrlList,
  extractUrls,
  buildDomainGroups,
  computeMetrics,
  type ParseResult,
  type ParsedLink,
  type PageAnalysis,
  type ExtractedUrl,
  type LinkMetrics,
  type GroupedSection,
  type HeadingGroup,
  type DomainGroup,
  type ParseHtmlOptions,
  type ParseUrlListOptions,
} from "./parser.js";
export {
  fetchAndParseUrlList,
  type FetchPageFn,
  type PageFetch,
  type FetchAndParseOptions,
  type BatchOutcome,
} from "./batch.js";
export { extractWebArchive, type WebArchiveContent } from "./webarchive.js";
export { safeFetch, SafeFetchError, type SafeFetchOptions, type SafeFetchResult } from "./safe-fetch.js";
export {
  registrableDomain,
  extractHost,
  stripWww,
} from "./domain.js";
