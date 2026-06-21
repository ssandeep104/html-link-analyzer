import { describe, expect, it } from "vitest";
import { extractHost, registrableDomain, stripWww } from "./domain.js";

describe("registrableDomain", () => {
  it("returns empty for empty input", () => {
    expect(registrableDomain("")).toBe("");
  });

  it("returns single-label hosts as-is", () => {
    expect(registrableDomain("localhost")).toBe("localhost");
  });

  it("returns the last two labels for standard TLDs", () => {
    expect(registrableDomain("example.com")).toBe("example.com");
    expect(registrableDomain("foo.example.com")).toBe("example.com");
    expect(registrableDomain("a.b.c.example.com")).toBe("example.com");
  });

  it("collapses common multi-label suffixes (co.uk, com.au, ...)", () => {
    expect(registrableDomain("news.bbc.co.uk")).toBe("bbc.co.uk");
    expect(registrableDomain("www.bbc.co.uk")).toBe("bbc.co.uk");
    expect(registrableDomain("foo.bar.example.com.au")).toBe("example.com.au");
    expect(registrableDomain("test.example.co.in")).toBe("example.co.in");
  });

  it("treats github.io and similar as suffixes so each subdomain is its own group", () => {
    expect(registrableDomain("ssandeep104.github.io")).toBe("ssandeep104.github.io");
    expect(registrableDomain("my-app.vercel.app")).toBe("my-app.vercel.app");
    expect(registrableDomain("project.netlify.app")).toBe("project.netlify.app");
  });

  it("preserves IPv4 addresses", () => {
    expect(registrableDomain("192.168.1.1")).toBe("192.168.1.1");
    expect(registrableDomain("10.0.0.1")).toBe("10.0.0.1");
  });

  it("is case-insensitive", () => {
    expect(registrableDomain("API.GitHub.COM")).toBe("github.com");
  });
});

describe("stripWww", () => {
  it("strips only a literal www. prefix", () => {
    expect(stripWww("www.example.com")).toBe("example.com");
    expect(stripWww("web.example.com")).toBe("web.example.com");
    expect(stripWww("wwx.example.com")).toBe("wwx.example.com");
  });
});

describe("extractHost", () => {
  it("returns hostname for absolute URLs", () => {
    expect(extractHost("https://example.com/foo")).toBe("example.com");
    expect(extractHost("http://API.example.com")).toBe("api.example.com");
  });

  it("returns hostname for protocol-relative URLs", () => {
    expect(extractHost("//cdn.example.com/a.js")).toBe("cdn.example.com");
  });

  it("returns empty for fragments / mailto / tel / javascript", () => {
    expect(extractHost("#top")).toBe("");
    expect(extractHost("mailto:a@b.com")).toBe("");
    expect(extractHost("tel:+1234")).toBe("");
    expect(extractHost("javascript:void(0)")).toBe("");
  });

  it("resolves relative URLs against a base when provided", () => {
    expect(extractHost("/about", "https://site.example/dir/")).toBe("site.example");
    expect(extractHost("foo.html", "https://site.example/dir/")).toBe("site.example");
  });

  it("returns empty for relative URLs with no base", () => {
    expect(extractHost("/about")).toBe("");
  });
});
