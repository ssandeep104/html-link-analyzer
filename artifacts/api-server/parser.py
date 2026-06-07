from bs4 import BeautifulSoup
from urllib.parse import urlparse, urljoin, urlunparse
from typing import Optional
import re
import plistlib


SEMANTIC_TAGS = {"header", "nav", "footer", "aside", "main", "section", "article"}
SEMANTIC_CLASS_RE = re.compile(r"\b(header|nav|footer|aside|main|sidebar|hero|content|article|section)\b", re.I)
HEADING_TAGS = {"h1", "h2", "h3", "h4", "h5", "h6"}


def classify_link(href: str, base_domain: str) -> str:
    if not href or href.strip() == "":
        return "special"
    href = href.strip()
    if href.startswith("#"):
        return "anchor"
    lower = href.lower()
    if any(lower.startswith(p) for p in ("mailto:", "tel:", "javascript:", "sms:", "fax:")):
        return "special"
    try:
        parsed = urlparse(href)
        if parsed.scheme in ("http", "https"):
            link_domain = parsed.netloc.lower().lstrip("www.")
            base = base_domain.lower().lstrip("www.")
            if link_domain == base or link_domain.endswith("." + base):
                return "internal"
            return "external"
        if not parsed.scheme and not parsed.netloc:
            # relative URL — internal
            return "internal"
        return "external"
    except Exception:
        return "special"


def find_semantic_section(element) -> str:
    """Walk up the DOM tree to find the nearest semantic container."""
    node = element.parent
    while node and node.name:
        tag = node.name.lower() if node.name else ""
        if tag in SEMANTIC_TAGS:
            return tag
        # Check class/id for semantic hints
        classes = " ".join(node.get("class", []))
        node_id = node.get("id", "")
        combined = f"{classes} {node_id}"
        if SEMANTIC_CLASS_RE.search(combined):
            # extract the matched keyword
            m = SEMANTIC_CLASS_RE.search(combined)
            return m.group(1).lower() if m else "body"
        node = node.parent
    return "body"


def find_preceding_heading(element, section_node) -> Optional[str]:
    """Find the nearest preceding heading in the same semantic section."""
    if section_node is None:
        return None
    # Collect all headings and all anchor elements within the section container
    all_headings = []
    all_elements = list(section_node.descendants)
    last_heading = None
    for node in all_elements:
        if not hasattr(node, "name") or not node.name:
            continue
        if node.name.lower() in HEADING_TAGS:
            last_heading = node.get_text(strip=True) or None
        if node is element:
            return last_heading
    return last_heading


def find_section_node(element):
    """Return the actual DOM node that is the semantic section container."""
    node = element.parent
    while node and node.name:
        tag = node.name.lower() if node.name else ""
        if tag in SEMANTIC_TAGS:
            return node
        classes = " ".join(node.get("class", []))
        node_id = node.get("id", "")
        combined = f"{classes} {node_id}"
        if SEMANTIC_CLASS_RE.search(combined):
            return node
        node = node.parent
    # fall back to root
    return element.find_parent()


def extract_webarchive_html(data: bytes) -> tuple[str, str]:
    """
    Parse a Safari Web Archive (plist) and return (html_content, base_url).
    Supports both binary and XML plist formats.
    """
    try:
        plist = plistlib.loads(data)
    except Exception as e:
        raise ValueError(f"Could not parse .webarchive file as a property list: {e}")

    main = plist.get("WebMainResource")
    if not main:
        raise ValueError("No WebMainResource found in the .webarchive file")

    mime = main.get("WebResourceMIMEType", "")
    if mime and not mime.startswith("text/html"):
        raise ValueError(f"Main resource MIME type is '{mime}', expected text/html")

    raw_data = main.get("WebResourceData", b"")
    encoding = main.get("WebResourceTextEncodingName", "utf-8") or "utf-8"
    try:
        html_content = raw_data.decode(encoding, errors="replace")
    except (LookupError, AttributeError):
        html_content = raw_data.decode("utf-8", errors="replace")

    base_url = main.get("WebResourceURL", "") or ""
    return html_content, base_url


def parse_html(html_content: str, base_url: str) -> dict:
    soup = BeautifulSoup(html_content, "lxml")
    parsed_base = urlparse(base_url)
    base_domain = parsed_base.netloc or ""

    links = []
    position = 0

    for a_tag in soup.find_all("a"):
        href = a_tag.get("href", "")
        if href is None:
            href = ""
        href = href.strip()

        text = a_tag.get_text(separator=" ", strip=True)

        # Resolve relative URLs
        if base_url and href and not href.startswith("#") and not any(
            href.lower().startswith(p) for p in ("mailto:", "tel:", "javascript:", "sms:")
        ):
            try:
                resolved = urljoin(base_url, href)
            except Exception:
                resolved = href
        else:
            resolved = href

        link_type = classify_link(href, base_domain)
        section_name = find_semantic_section(a_tag)
        section_node = find_section_node(a_tag)
        heading = find_preceding_heading(a_tag, section_node)

        links.append({
            "id": position + 1,
            "text": text,
            "href": href,
            "resolved_href": resolved,
            "type": link_type,
            "section": section_name,
            "heading": heading,
            "position": position + 1,
        })
        position += 1

    # Metrics
    metrics = {
        "total": len(links),
        "internal": sum(1 for l in links if l["type"] == "internal"),
        "external": sum(1 for l in links if l["type"] == "external"),
        "anchor": sum(1 for l in links if l["type"] == "anchor"),
        "special": sum(1 for l in links if l["type"] == "special"),
    }

    # Grouped tree: section -> heading -> links
    sections_dict: dict[str, dict] = {}
    for link in links:
        sec = link["section"] or "body"
        hdg = link["heading"]  # may be None

        if sec not in sections_dict:
            sections_dict[sec] = {}
        key = hdg if hdg is not None else "__none__"
        if key not in sections_dict[sec]:
            sections_dict[sec][key] = []
        sections_dict[sec][key].append(link)

    grouped = []
    for sec_name, headings_dict in sections_dict.items():
        headings_list = []
        for hdg_key, hdg_links in headings_dict.items():
            headings_list.append({
                "heading": None if hdg_key == "__none__" else hdg_key,
                "links": hdg_links,
            })
        grouped.append({
            "section": sec_name,
            "headings": headings_list,
        })

    return {
        "links": links,
        "metrics": metrics,
        "grouped": grouped,
    }
