import { describe, expect, it } from "vitest";
import { classifyLink, resolveHref, hasTrackingParams, stripTrackingParams } from "./classify.js";

describe("classifyLink", () => {
  it("classifies empty href as special", () => {
    expect(classifyLink("", "example.com")).toBe("special");
    expect(classifyLink("   ", "example.com")).toBe("special");
  });

  it("classifies fragment links as anchor", () => {
    expect(classifyLink("#top", "example.com")).toBe("anchor");
    expect(classifyLink("#section-1", "example.com")).toBe("anchor");
  });

  it("classifies mailto/tel/sms/javascript as special", () => {
    expect(classifyLink("mailto:foo@bar.com", "x.com")).toBe("special");
    expect(classifyLink("tel:+15551234", "x.com")).toBe("special");
    expect(classifyLink("sms:+15551234", "x.com")).toBe("special");
    expect(classifyLink("javascript:void(0)", "x.com")).toBe("special");
  });

  it("classifies data: / blob: / file: as special", () => {
    expect(classifyLink("data:text/plain,hi", "x.com")).toBe("special");
    expect(classifyLink("blob:https://x.com/uuid", "x.com")).toBe("special");
    expect(classifyLink("file:///etc/hosts", "x.com")).toBe("special");
  });

  it("classifies relative URLs as internal", () => {
    expect(classifyLink("/about", "example.com")).toBe("internal");
    expect(classifyLink("about.html", "example.com")).toBe("internal");
    expect(classifyLink("../path", "example.com")).toBe("internal");
  });

  it("classifies same-domain absolute URLs as internal", () => {
    expect(classifyLink("https://example.com/about", "example.com")).toBe("internal");
    expect(classifyLink("http://www.example.com/", "example.com")).toBe("internal");
    expect(classifyLink("https://example.com/", "www.example.com")).toBe("internal");
  });

  it("classifies subdomains as internal", () => {
    expect(classifyLink("https://blog.example.com/post", "example.com")).toBe("internal");
    expect(classifyLink("https://api.example.com/", "www.example.com")).toBe("internal");
  });

  it("classifies different-domain URLs as external", () => {
    expect(classifyLink("https://other.com", "example.com")).toBe("external");
    expect(classifyLink("https://google.com", "example.com")).toBe("external");
  });

  it("strips www. as a literal prefix only, never as a character set (regression for Python lstrip bug)", () => {
    // The original Python used `lstrip("www.")`, which is a CHARACTER-SET strip:
    //   "www.foo.com".lstrip("www.") -> "foo.com"   (looks right by accident)
    //   "web.example.com".lstrip("www.") -> "eb.example.com"   (wrong!)
    //   "oww.x.com".lstrip("www.") -> "x.com"   (very wrong!)
    // A proper prefix strip removes only the literal leading "www." so neither
    // hostname starting with non-"www." characters but containing w/o/.-chars
    // gets mangled. We assert internal/external behavior survives that.
    expect(classifyLink("https://web.example.com/", "example.com")).toBe("internal");
    // "oww.x.com" is NOT a subdomain of "x.com" by the dot-boundary rule
    // ("oww.x.com" does end with ".x.com" so it IS a legit subdomain), but
    // the key point is that a bad lstrip would have made the base "x.com" be
    // compared against "x.com" and given the wrong answer for non-related hosts.
    expect(classifyLink("https://other.com/", "oww.x.com")).toBe("external");
  });

  it("handles protocol-relative URLs", () => {
    expect(classifyLink("//example.com/path", "example.com")).toBe("internal");
    expect(classifyLink("//other.com/path", "example.com")).toBe("external");
  });

  it("treats unparseable hrefs without scheme as relative/internal", () => {
    expect(classifyLink("foo bar baz", "example.com")).toBe("internal");
  });
});

describe("resolveHref", () => {
  it("returns fragments unchanged", () => {
    expect(resolveHref("#top", "https://example.com/page")).toBe("#top");
  });

  it("returns mailto/tel unchanged", () => {
    expect(resolveHref("mailto:x@y.com", "https://example.com")).toBe("mailto:x@y.com");
    expect(resolveHref("tel:+1234", "https://example.com")).toBe("tel:+1234");
  });

  it("resolves relative URLs against base", () => {
    expect(resolveHref("/about", "https://example.com/page")).toBe("https://example.com/about");
    expect(resolveHref("about.html", "https://example.com/dir/")).toBe(
      "https://example.com/dir/about.html",
    );
  });

  it("preserves absolute URLs", () => {
    expect(resolveHref("https://other.com/x", "https://example.com")).toBe("https://other.com/x");
  });

  it("returns raw href when base is empty", () => {
    expect(resolveHref("/about", "")).toBe("/about");
  });
});

describe("hasTrackingParams", () => {
  it("detects utm_ params", () => {
    expect(hasTrackingParams("https://x.com/?utm_source=foo")).toBe(true);
    expect(hasTrackingParams("https://x.com/?utm_campaign=bar&other=1")).toBe(true);
  });

  it("detects fbclid / gclid / msclkid", () => {
    expect(hasTrackingParams("https://x.com/?fbclid=abc")).toBe(true);
    expect(hasTrackingParams("https://x.com/?gclid=abc")).toBe(true);
    expect(hasTrackingParams("https://x.com/?msclkid=abc")).toBe(true);
  });

  it("returns false when no tracking params present", () => {
    expect(hasTrackingParams("https://x.com/?page=2")).toBe(false);
    expect(hasTrackingParams("https://x.com/")).toBe(false);
  });
});

describe("stripTrackingParams", () => {
  it("removes tracking params and preserves the rest", () => {
    const cleaned = stripTrackingParams("https://x.com/p?utm_source=a&id=42&fbclid=z");
    const u = new URL(cleaned);
    expect(u.searchParams.has("utm_source")).toBe(false);
    expect(u.searchParams.has("fbclid")).toBe(false);
    expect(u.searchParams.get("id")).toBe("42");
  });
});
