import { describe, expect, it, vi } from "vitest";
import { fetchAndParseUrlList, type FetchPageFn } from "./batch.js";

const pageA = `<html><body><a href="/about">About</a><a href="https://external.com/x">Ext</a></body></html>`;
const pageB = `<html><body><a href="https://a.com/1">One</a></body></html>`;

function mockFetch(pages: Record<string, string>, failOn: string[] = []): FetchPageFn {
  return vi.fn(async (url: string) => {
    if (failOn.includes(url)) throw new Error("boom: connection refused");
    const body = pages[url];
    if (body === undefined) throw new Error(`unexpected url ${url}`);
    return { body, finalUrl: url, truncated: false };
  });
}

describe("fetchAndParseUrlList", () => {
  it("fetches every URL in the list and merges their links, stamped with page_url", async () => {
    const fetch = mockFetch({
      "https://a.example/": pageA,
      "https://b.example/": pageB,
    });
    const { result, skipped } = await fetchAndParseUrlList(
      "https://a.example/\nhttps://b.example/",
      fetch,
    );

    expect(skipped).toBe(0);
    expect(result.metrics.total).toBe(3);
    expect(result.pages).toHaveLength(2);
    expect(result.pages![0]).toMatchObject({ url: "https://a.example/", status: "ok", links: 2 });
    expect(result.pages![1]).toMatchObject({ url: "https://b.example/", status: "ok", links: 1 });

    // Every merged link carries its source page.
    const byPage = new Map<string, number>();
    for (const link of result.links) {
      expect(link.page_url).toBeTruthy();
      byPage.set(link.page_url!, (byPage.get(link.page_url!) ?? 0) + 1);
    }
    expect(byPage.get("https://a.example/")).toBe(2);
    expect(byPage.get("https://b.example/")).toBe(1);

    // Link ids are sequential across pages.
    expect(result.links.map((l) => l.id)).toEqual([1, 2, 3]);

    // Aggregate views still work.
    expect(result.metrics.unique_domains).toBeGreaterThan(0);
    expect(result.grouped_by_domain.length).toBeGreaterThan(0);
  });

  it("records a failed page as an error and keeps the rest of the batch", async () => {
    const fetch = mockFetch(
      { "https://good.example/": pageB },
      ["https://dead.example/"],
    );
    const { result } = await fetchAndParseUrlList(
      "https://good.example/\nhttps://dead.example/",
      fetch,
    );

    expect(result.metrics.total).toBe(1);
    expect(result.pages).toHaveLength(2);
    expect(result.pages![0]).toMatchObject({ status: "ok" });
    expect(result.pages![1]).toMatchObject({
      url: "https://dead.example/",
      status: "error",
      error: expect.stringContaining("boom"),
    });
    expect(result.source).toContain("1/2 pages fetched");
  });

  it("dedupes repeated URLs and reports unparseable lines as errors", async () => {
    const fetch = mockFetch({ "https://dup.example/": pageB });
    const { result } = await fetchAndParseUrlList(
      "https://dup.example/\nhttps://dup.example/\njust some words\nmailto:a@b.com",
      fetch,
    );

    // One fetch for the dupe; the words-only line has no URL and is ignored;
    // the mailto: line is extracted but can't be fetched, so it's an error.
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.pages).toHaveLength(2);
    expect(result.pages![0]).toMatchObject({ status: "ok" });
    expect(result.pages![1]).toMatchObject({ status: "error" });
  });

  it("normalizes bare hosts with https://", async () => {
    const fetch = mockFetch({ "https://bare.example/": pageB });
    const { result } = await fetchAndParseUrlList("bare.example/", fetch);
    expect(fetch).toHaveBeenCalledWith("https://bare.example/");
    expect(result.pages![0]).toMatchObject({ status: "ok" });
  });

  it("caps the batch at maxPages and reports how many were skipped", async () => {
    const pages: Record<string, string> = {};
    const lines: string[] = [];
    for (let i = 0; i < 8; i++) {
      const u = `https://p${i}.example/`;
      pages[u] = pageB;
      lines.push(u);
    }
    const fetch = mockFetch(pages);
    const { result, skipped } = await fetchAndParseUrlList(lines.join("\n"), fetch, {
      maxPages: 3,
    });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(skipped).toBe(5);
    expect(result.pages).toHaveLength(3);
  });

  it("respects the concurrency limit", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const fetch: FetchPageFn = async (url: string) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 10));
      inFlight -= 1;
      return { body: pageB, finalUrl: url, truncated: false };
    };
    const lines = Array.from({ length: 6 }, (_, i) => `https://c${i}.example/`);
    await fetchAndParseUrlList(lines.join("\n"), fetch, { concurrency: 2 });
    expect(maxInFlight).toBeLessThanOrEqual(2);
    expect(maxInFlight).toBeGreaterThan(0);
  });
});
