import { describe, expect, it } from "vitest";
import { parseHtml } from "./parser.js";

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
});
