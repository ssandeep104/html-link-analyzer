import { describe, expect, it } from "vitest";
import { parseHtml, parseUrlList } from "./parser.js";

describe("parseHtml", () => {
  it("extracts no links from an empty document", () => {
    const r = parseHtml("<html><body></body></html>", {
      source: "test",
      baseUrl: "https://example.com",
    });
    expect(r.links).toEqual([]);
    expect(r.metrics.total).toBe(0);
  });

  it("classifies internal/external/anchor links and counts metrics", () => {
    const html = `
      <html><body>
        <a href="/about">About</a>
        <a href="https://example.com/contact">Contact</a>
        <a href="https://google.com">Google</a>
        <a href="#section">Jump</a>
        <a href="mailto:hi@x.com">Mail</a>
      </body></html>
    `;
    const r = parseHtml(html, { source: "test", baseUrl: "https://example.com/" });
    expect(r.metrics.total).toBe(5);
    expect(r.metrics.internal).toBe(2);
    expect(r.metrics.external).toBe(1);
    expect(r.metrics.anchor).toBe(1);
    expect(r.metrics.special).toBe(1);
  });

  it("resolves relative hrefs against base URL", () => {
    const html = `<a href="/foo">Foo</a><a href="bar.html">Bar</a>`;
    const r = parseHtml(html, { source: "t", baseUrl: "https://example.com/dir/" });
    expect(r.links[0]?.resolved_href).toBe("https://example.com/foo");
    expect(r.links[1]?.resolved_href).toBe("https://example.com/dir/bar.html");
  });

  it("preserves position / id sequencing", () => {
    const html = `<a href="/a">A</a><a href="/b">B</a><a href="/c">C</a>`;
    const r = parseHtml(html, { source: "t", baseUrl: "https://x.com" });
    expect(r.links.map((l) => l.id)).toEqual([1, 2, 3]);
    expect(r.links.map((l) => l.position)).toEqual([1, 2, 3]);
    expect(r.links.map((l) => l.text)).toEqual(["A", "B", "C"]);
  });

  it("identifies the semantic section by tag name", () => {
    const html = `
      <html><body>
        <nav><a href="/home">Home</a></nav>
        <main><a href="/article">Article</a></main>
        <footer><a href="/legal">Legal</a></footer>
      </body></html>
    `;
    const r = parseHtml(html, { source: "t", baseUrl: "https://x.com" });
    expect(r.links[0]?.section).toBe("nav");
    expect(r.links[1]?.section).toBe("main");
    expect(r.links[2]?.section).toBe("footer");
  });

  it("identifies semantic section by class name as fallback", () => {
    const html = `
      <html><body>
        <div class="site-header"><a href="/h">H</a></div>
        <div class="sidebar"><a href="/s">S</a></div>
      </body></html>
    `;
    const r = parseHtml(html, { source: "t", baseUrl: "https://x.com" });
    expect(r.links[0]?.section).toBe("header");
    expect(r.links[1]?.section).toBe("sidebar");
  });

  it("attaches the nearest preceding heading", () => {
    const html = `
      <html><body>
        <main>
          <h1>Top</h1>
          <a href="/a">A</a>
          <h2>Sub</h2>
          <a href="/b">B</a>
          <a href="/c">C</a>
        </main>
      </body></html>
    `;
    const r = parseHtml(html, { source: "t", baseUrl: "https://x.com" });
    expect(r.links[0]?.heading).toBe("Top");
    expect(r.links[1]?.heading).toBe("Sub");
    expect(r.links[2]?.heading).toBe("Sub");
  });

  it("groups links by section then heading", () => {
    const html = `
      <main>
        <h1>One</h1><a href="/a">A</a>
        <h2>Two</h2><a href="/b">B</a><a href="/c">C</a>
      </main>
    `;
    const r = parseHtml(html, { source: "t", baseUrl: "https://x.com" });
    expect(r.grouped.length).toBe(1);
    const main = r.grouped[0]!;
    expect(main.section).toBe("main");
    expect(main.headings.length).toBe(2);
    expect(main.headings[0]?.heading).toBe("One");
    expect(main.headings[0]?.links.length).toBe(1);
    expect(main.headings[1]?.heading).toBe("Two");
    expect(main.headings[1]?.links.length).toBe(2);
  });

  it("handles a Netscape bookmarks-export style document", () => {
    const html = `
      <!DOCTYPE NETSCAPE-Bookmark-file-1>
      <TITLE>Bookmarks</TITLE>
      <H1>Bookmarks Menu</H1>
      <DL><p>
        <DT><H3>Dev</H3>
        <DL><p>
          <DT><A HREF="https://github.com/">GitHub</A>
          <DT><A HREF="https://stackoverflow.com/">SO</A>
        </DL><p>
        <DT><H3>News</H3>
        <DL><p>
          <DT><A HREF="https://news.ycombinator.com/">HN</A>
        </DL><p>
      </DL><p>
    `;
    const r = parseHtml(html, { source: "bookmarks.html", baseUrl: "" });
    expect(r.metrics.total).toBe(3);
    expect(r.links.map((l) => l.text)).toEqual(["GitHub", "SO", "HN"]);
    expect(r.metrics.external).toBe(3);
  });

  it("trims and collapses whitespace in link text", () => {
    const html = `<a href="/x">  Hello\n   World  </a>`;
    const r = parseHtml(html, { source: "t", baseUrl: "https://x.com" });
    expect(r.links[0]?.text).toBe("Hello World");
  });

  it("attaches host and registrable domain to every link", () => {
    const html = `
      <a href="https://news.bbc.co.uk/article">BBC</a>
      <a href="https://api.github.com/repos">GH API</a>
      <a href="/about">Relative</a>
      <a href="#top">Anchor</a>
      <a href="mailto:hi@x.com">Mail</a>
    `;
    const r = parseHtml(html, { source: "t", baseUrl: "https://example.com/" });
    expect(r.links[0]?.host).toBe("news.bbc.co.uk");
    expect(r.links[0]?.domain).toBe("bbc.co.uk");
    expect(r.links[1]?.host).toBe("api.github.com");
    expect(r.links[1]?.domain).toBe("github.com");
    // Relative link inherits the base host.
    expect(r.links[2]?.host).toBe("example.com");
    expect(r.links[2]?.domain).toBe("example.com");
    expect(r.links[3]?.host).toBe("");
    expect(r.links[3]?.domain).toBe("");
    expect(r.links[4]?.host).toBe("");
    expect(r.links[4]?.domain).toBe("");
  });

  it("reports unique_domains in metrics", () => {
    const html = `
      <a href="https://github.com/a">A</a>
      <a href="https://api.github.com/b">B</a>
      <a href="https://example.com">C</a>
      <a href="#frag">F</a>
    `;
    const r = parseHtml(html, { source: "t", baseUrl: "https://site.test/" });
    // github.com (shared by both github links) + example.com = 2
    expect(r.metrics.unique_domains).toBe(2);
  });

  it("builds grouped_by_domain sorted by count desc then alpha", () => {
    const html = `
      <a href="https://github.com/a">A</a>
      <a href="https://github.com/b">B</a>
      <a href="https://example.com/c">C</a>
      <a href="https://zzz.com/d">D</a>
    `;
    const r = parseHtml(html, { source: "t", baseUrl: "https://site.test/" });
    expect(r.grouped_by_domain[0]?.domain).toBe("github.com");
    expect(r.grouped_by_domain[0]?.count).toBe(2);
    // example.com and zzz.com both have count 1 → alphabetical
    expect(r.grouped_by_domain[1]?.domain).toBe("example.com");
    expect(r.grouped_by_domain[2]?.domain).toBe("zzz.com");
  });
});

describe("parseUrlList", () => {
  it("extracts one URL per line", () => {
    const text = `
      https://github.com
      https://news.ycombinator.com
      https://example.com
    `;
    const r = parseUrlList(text);
    expect(r.metrics.total).toBe(3);
    expect(r.links.map((l) => l.host)).toEqual([
      "github.com",
      "news.ycombinator.com",
      "example.com",
    ]);
  });

  it("tolerates bullets, numbering, and markdown-link syntax", () => {
    const text = [
      "- https://github.com",
      "* https://gitlab.com",
      "1. https://bitbucket.org",
      "[Hacker News](https://news.ycombinator.com/)",
      '"https://example.com"',
      "<https://wikipedia.org>",
    ].join("\n");
    const r = parseUrlList(text);
    expect(r.metrics.total).toBe(6);
    expect(r.links[3]?.text).toBe("Hacker News");
    expect(r.links[3]?.host).toBe("news.ycombinator.com");
  });

  it("dedupes exact-duplicate resolved URLs", () => {
    const text = `
      https://example.com
      https://example.com
      https://example.com/other
    `;
    const r = parseUrlList(text);
    expect(r.metrics.total).toBe(2);
  });

  it("adds https:// to bare hosts", () => {
    const text = `
      www.example.com
      github.com/foo
    `;
    const r = parseUrlList(text);
    expect(r.links[0]?.resolved_href).toMatch(/^https:\/\/www\.example\.com/);
    expect(r.links[1]?.host).toBe("github.com");
  });

  it("groups by domain and reports unique_domains", () => {
    const text = `
      https://github.com/a
      https://api.github.com/b
      https://news.bbc.co.uk/x
      https://www.bbc.co.uk/y
      https://example.com
    `;
    const r = parseUrlList(text);
    const domains = r.grouped_by_domain.map((g) => g.domain);
    expect(domains).toContain("github.com");
    expect(domains).toContain("bbc.co.uk");
    expect(domains).toContain("example.com");
    expect(r.metrics.unique_domains).toBe(3);
    const bbc = r.grouped_by_domain.find((g) => g.domain === "bbc.co.uk")!;
    expect(bbc.count).toBe(2);
    expect(bbc.hosts).toEqual(["news.bbc.co.uk", "www.bbc.co.uk"]);
  });

  it("produces empty grouped (DOM-only)", () => {
    const r = parseUrlList("https://example.com");
    expect(r.grouped).toEqual([]);
  });

  it("ignores blank lines and pure noise", () => {
    const text = `

      not a url
      ===========
      https://example.com
    `;
    const r = parseUrlList(text);
    expect(r.metrics.total).toBe(1);
    expect(r.links[0]?.host).toBe("example.com");
  });
});
