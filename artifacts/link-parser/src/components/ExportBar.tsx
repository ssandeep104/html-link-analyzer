import { ParseResult, ParsedLink, DomainGroup } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Download, FileJson, FileCode2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ExportBarProps {
  result: ParseResult;
}

/** Escape any string for safe interpolation into the HTML report. */
function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escape for use inside an HTML attribute value. */
function escapeAttr(s: unknown): string {
  return escapeHtml(s);
}

const TYPE_COLORS: Record<string, { bg: string; fg: string; bd: string }> = {
  internal: { bg: "rgba(20,184,166,0.10)", fg: "#14b8a6", bd: "rgba(20,184,166,0.25)" },
  external: { bg: "rgba(245,158,11,0.10)", fg: "#f59e0b", bd: "rgba(245,158,11,0.25)" },
  special:  { bg: "rgba(168,85,247,0.10)", fg: "#a855f7", bd: "rgba(168,85,247,0.25)" },
  anchor:   { bg: "rgba(156,163,175,0.10)", fg: "#9ca3af", bd: "rgba(156,163,175,0.25)" },
};

function renderLinkRow(link: ParsedLink, opts: { showDomain?: boolean } = {}): string {
  const showSub = opts.showDomain && link.host && link.host !== link.domain;
  return `
    <div class="link-row" data-search="${escapeAttr(
      `${link.text} ${link.href} ${link.domain} ${link.host}`.toLowerCase(),
    )}" data-type="${escapeAttr(link.type)}">
      <div class="link-meta">
        <p class="link-text">${link.text ? escapeHtml(link.text) : '<em class="muted">No text content</em>'}</p>
        <div class="link-href-row">
          <span class="link-href mono" title="${escapeAttr(link.href)}">${escapeHtml(link.href)}</span>
          ${showSub ? `<span class="host-chip mono">${escapeHtml(link.host)}</span>` : ""}
        </div>
      </div>
      <div class="link-actions">
        <span class="badge type-${escapeAttr(link.type)}">${escapeHtml(link.type)}</span>
        <a class="open-link" href="${escapeAttr(link.resolved_href)}" target="_blank" rel="noopener noreferrer" title="Open">↗</a>
      </div>
    </div>
  `;
}

function renderDomainGroup(group: DomainGroup, maxCount: number): string {
  const widthPct = maxCount > 0 ? Math.max(4, (group.count / maxCount) * 100) : 0;
  const isEmpty = !group.domain;
  const headerIcon = isEmpty
    ? `<span class="favicon-fallback">#</span>`
    : `<img class="favicon" src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(
        group.domain,
      )}&sz=32" width="16" height="16" alt="" onerror="this.style.visibility='hidden'">`;
  const hostsChip =
    group.hosts.length > 1
      ? `<span class="hosts-chip">${group.hosts.length} hosts</span>`
      : "";
  return `
    <details class="domain-card" open data-search="${escapeAttr(
      group.domain.toLowerCase(),
    )}">
      <summary class="domain-summary">
        ${headerIcon}
        <span class="domain-name">${isEmpty ? "Anchors &amp; non-HTTP" : escapeHtml(group.domain)}</span>
        ${hostsChip}
        <span class="bar-track"><span class="bar-fill" style="width:${widthPct.toFixed(1)}%"></span></span>
        <span class="count-badge">${group.count}</span>
      </summary>
      <div class="domain-links">
        ${group.links.map((l) => renderLinkRow(l, { showDomain: true })).join("")}
      </div>
    </details>
  `;
}

function renderSectionView(result: ParseResult): string {
  if (result.grouped.length === 0) {
    return `<p class="muted" style="padding:1rem;">No section grouping (URL-list input has no DOM).</p>`;
  }
  return result.grouped
    .map(
      (section) => `
    <details class="domain-card" open>
      <summary class="domain-summary">
        <span class="domain-name" style="text-transform:capitalize;">${escapeHtml(section.section || "Unsectioned")}</span>
        <span class="bar-track"></span>
        <span class="count-badge">${section.headings.reduce((a, h) => a + h.links.length, 0)}</span>
      </summary>
      <div class="domain-links">
        ${section.headings
          .map(
            (h) => `
          ${
            h.heading
              ? `<div class="heading-row">${escapeHtml(h.heading)}</div>`
              : ""
          }
          ${h.links.map((l) => renderLinkRow(l)).join("")}
        `,
          )
          .join("")}
      </div>
    </details>
  `,
    )
    .join("");
}

function renderTableView(links: ParsedLink[]): string {
  return `
    <table class="flat-table">
      <thead>
        <tr>
          <th>#</th><th>Text</th><th>Href</th><th>Domain</th><th>Type</th><th>Section</th>
        </tr>
      </thead>
      <tbody>
        ${links
          .map(
            (link) => `
          <tr data-search="${escapeAttr(
            `${link.text} ${link.href} ${link.domain} ${link.host}`.toLowerCase(),
          )}" data-type="${escapeAttr(link.type)}">
            <td class="mono">${link.position}</td>
            <td>${link.text ? escapeHtml(link.text) : '<em class="muted">No text</em>'}</td>
            <td class="mono"><a href="${escapeAttr(link.resolved_href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.href)}</a></td>
            <td class="mono muted">${escapeHtml(link.domain || "—")}</td>
            <td><span class="badge type-${escapeAttr(link.type)}">${escapeHtml(link.type)}</span></td>
            <td class="muted" style="text-transform:capitalize;">${escapeHtml(link.section || "—")}</td>
          </tr>
        `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function buildHtmlReport(result: ParseResult): string {
  const m = result.metrics;
  const maxCount = result.grouped_by_domain.reduce((mx, g) => Math.max(mx, g.count), 0);
  const hasSection = result.grouped.length > 0;
  const generatedAt = new Date().toISOString();

  // Build per-type CSS rules
  const typeCss = Object.entries(TYPE_COLORS)
    .map(
      ([t, c]) =>
        `.badge.type-${t}{background:${c.bg};color:${c.fg};border-color:${c.bd};}`,
    )
    .join("\n        ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Link Report — ${escapeHtml(result.source)}</title>
<style>
  :root {
    --bg: #09090b;
    --bg-card: #18181b;
    --bg-hover: #1f1f23;
    --border: #27272a;
    --fg: #ededed;
    --fg-muted: #a1a1aa;
    --fg-dim: #71717a;
    --primary: #3b82f6;
    --primary-dim: rgba(59,130,246,0.5);
    --radius: 0.625rem;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: var(--bg); color: var(--fg);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    font-size: 14px; line-height: 1.5; }
  .mono { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace; }
  .muted { color: var(--fg-muted); }
  a { color: var(--primary); text-decoration: none; }
  a:hover { text-decoration: underline; }
  em { font-style: italic; color: var(--fg-dim); }
  .container { max-width: 1200px; margin: 0 auto; padding: 2rem 1.5rem; }
  header.report-header { border-bottom: 1px solid var(--border); padding-bottom: 1.25rem; margin-bottom: 1.5rem; }
  header.report-header h1 { font-size: 1.5rem; margin: 0 0 0.25rem; font-weight: 600; letter-spacing: -0.01em; }
  header.report-header .source { color: var(--fg-muted); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.85rem; word-break: break-all; }
  header.report-header .meta { color: var(--fg-dim); font-size: 0.75rem; margin-top: 0.5rem; }

  /* Metrics tiles */
  .metrics { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem; margin-bottom: 1.5rem; }
  @media (min-width: 640px) { .metrics { grid-template-columns: repeat(3, 1fr); } }
  @media (min-width: 1024px) { .metrics { grid-template-columns: repeat(6, 1fr); } }
  .tile { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 0.85rem 1rem; }
  .tile-label { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--fg-muted); margin-bottom: 0.5rem; }
  .tile-value { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 1.6rem; font-weight: 700; letter-spacing: -0.02em; }
  .tile.total .tile-value { color: var(--fg); }
  .tile.domains .tile-value { color: #38bdf8; }
  .tile.internal .tile-value { color: #14b8a6; }
  .tile.external .tile-value { color: #f59e0b; }
  .tile.anchor .tile-value { color: #9ca3af; }
  .tile.special .tile-value { color: #a855f7; }

  /* Controls */
  .controls { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; margin-bottom: 1rem;
    background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); padding: 0.75rem; position: sticky; top: 0; z-index: 10; }
  .controls input[type="search"] { flex: 1 1 240px; min-width: 200px; padding: 0.55rem 0.85rem;
    background: var(--bg); border: 1px solid var(--border); color: var(--fg); border-radius: 0.4rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.85rem; outline: none; }
  .controls input[type="search"]:focus { border-color: var(--primary-dim); }
  .controls select { padding: 0.5rem 0.6rem; background: var(--bg); border: 1px solid var(--border); color: var(--fg);
    border-radius: 0.4rem; font-size: 0.85rem; }
  .view-tabs { display: inline-flex; background: var(--bg); border: 1px solid var(--border); border-radius: 0.4rem; padding: 2px; }
  .view-tabs button { background: transparent; border: 0; color: var(--fg-muted); font-size: 0.8rem; padding: 0.35rem 0.7rem;
    border-radius: 0.3rem; cursor: pointer; font-family: inherit; }
  .view-tabs button.active { background: var(--bg-card); color: var(--fg); }

  /* Views */
  .view { display: none; }
  .view.active { display: block; }

  /* Domain cards */
  .domain-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius);
    margin-bottom: 0.6rem; overflow: hidden; }
  .domain-card[hidden] { display: none; }
  .domain-summary { list-style: none; padding: 0.65rem 1rem; cursor: pointer; display: flex;
    align-items: center; gap: 0.6rem; transition: background 0.15s; user-select: none; }
  .domain-summary::-webkit-details-marker { display: none; }
  .domain-summary:hover { background: var(--bg-hover); }
  .domain-card[open] .domain-summary { border-bottom: 1px solid var(--border); }
  .domain-summary::before { content: "▸"; color: var(--fg-dim); font-size: 0.7rem; transition: transform 0.15s; width: 0.7rem; }
  .domain-card[open] .domain-summary::before { transform: rotate(90deg); }
  .favicon { border-radius: 3px; flex-shrink: 0; }
  .favicon-fallback { display: inline-flex; width: 16px; height: 16px; color: var(--fg-muted); font-family: ui-monospace, Menlo, monospace; font-weight: bold; }
  .domain-name { font-weight: 600; font-size: 0.9rem; letter-spacing: -0.005em; }
  .hosts-chip { font-size: 0.65rem; padding: 0.1rem 0.4rem; border: 1px solid var(--border); border-radius: 0.25rem;
    color: var(--fg-muted); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; flex-shrink: 0; }
  .bar-track { flex: 1; height: 5px; background: rgba(255,255,255,0.05); border-radius: 999px; overflow: hidden; max-width: 200px; min-width: 40px; }
  .bar-fill { display: block; height: 100%; background: var(--primary-dim); border-radius: 999px; }
  .count-badge { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.8rem;
    background: var(--bg); color: var(--fg-muted); padding: 0.15rem 0.55rem; border-radius: 999px;
    border: 1px solid var(--border); flex-shrink: 0; }

  /* Link rows inside a card */
  .domain-links { background: rgba(0,0,0,0.15); }
  .link-row { padding: 0.6rem 1rem; display: flex; align-items: center; gap: 1rem;
    border-bottom: 1px solid rgba(255,255,255,0.03); }
  .link-row[hidden] { display: none; }
  .link-row:last-child { border-bottom: 0; }
  .link-row:hover { background: var(--bg-hover); }
  .link-meta { flex: 1; min-width: 0; }
  .link-text { font-size: 0.85rem; font-weight: 500; margin: 0 0 0.15rem; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis; }
  .link-href-row { display: flex; align-items: center; gap: 0.5rem; min-width: 0; }
  .link-href { font-size: 0.72rem; color: var(--fg-muted); white-space: nowrap; overflow: hidden;
    text-overflow: ellipsis; flex: 1; min-width: 0; }
  .host-chip { font-size: 0.65rem; padding: 0.05rem 0.35rem; border: 1px solid rgba(255,255,255,0.08);
    border-radius: 0.2rem; color: var(--fg-dim); flex-shrink: 0; }
  .link-actions { display: flex; align-items: center; gap: 0.6rem; flex-shrink: 0; }
  .open-link { font-size: 1rem; color: var(--fg-muted); padding: 0 0.25rem; }
  .open-link:hover { color: var(--fg); text-decoration: none; }
  .badge { display: inline-block; padding: 0.1rem 0.45rem; border-radius: 0.25rem; font-size: 0.65rem;
    font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; border: 1px solid; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  ${typeCss}

  .heading-row { background: rgba(255,255,255,0.03); padding: 0.4rem 1rem;
    font-size: 0.7rem; font-weight: 600; color: var(--fg-muted); text-transform: uppercase;
    letter-spacing: 0.08em; border-bottom: 1px solid var(--border); }

  /* Flat table view */
  .flat-table { width: 100%; border-collapse: collapse; background: var(--bg-card);
    border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
  .flat-table th { background: rgba(255,255,255,0.02); text-align: left; padding: 0.6rem 0.85rem;
    font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--fg-muted);
    border-bottom: 1px solid var(--border); }
  .flat-table td { padding: 0.55rem 0.85rem; border-bottom: 1px solid rgba(255,255,255,0.03);
    font-size: 0.82rem; vertical-align: top; }
  .flat-table tbody tr:hover { background: var(--bg-hover); }
  .flat-table tr[hidden] { display: none; }

  .empty-state { padding: 2rem; text-align: center; color: var(--fg-muted); }

  footer.report-footer { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--border);
    color: var(--fg-dim); font-size: 0.7rem; text-align: center; }
</style>
</head>
<body>
<div class="container">
  <header class="report-header">
    <h1>Link Report</h1>
    <div class="source">${escapeHtml(result.source)}</div>
    <div class="meta">Generated ${escapeHtml(generatedAt)} · ${m.total} links · ${m.unique_domains} domain${m.unique_domains === 1 ? "" : "s"}</div>
  </header>

  <section class="metrics">
    <div class="tile total"><div class="tile-label">Total</div><div class="tile-value">${m.total}</div></div>
    <div class="tile domains"><div class="tile-label">Domains</div><div class="tile-value">${m.unique_domains}</div></div>
    <div class="tile internal"><div class="tile-label">Internal</div><div class="tile-value">${m.internal}</div></div>
    <div class="tile external"><div class="tile-label">External</div><div class="tile-value">${m.external}</div></div>
    <div class="tile anchor"><div class="tile-label">Anchors</div><div class="tile-value">${m.anchor}</div></div>
    <div class="tile special"><div class="tile-label">Special</div><div class="tile-value">${m.special}</div></div>
  </section>

  <div class="controls">
    <input type="search" id="search" placeholder="Filter by text, href, or domain..." autocomplete="off">
    <select id="typeFilter">
      <option value="all">All types</option>
      <option value="internal">Internal</option>
      <option value="external">External</option>
      <option value="anchor">Anchor</option>
      <option value="special">Special</option>
    </select>
    <div class="view-tabs" role="tablist">
      <button class="active" data-view="domain">Domain</button>
      ${hasSection ? `<button data-view="section">Section</button>` : ""}
      <button data-view="flat">Table</button>
    </div>
  </div>

  <section class="view active" data-view="domain">
    ${
      result.grouped_by_domain.length === 0
        ? `<div class="empty-state">No links to display.</div>`
        : result.grouped_by_domain.map((g) => renderDomainGroup(g, maxCount)).join("")
    }
  </section>

  ${hasSection ? `<section class="view" data-view="section">${renderSectionView(result)}</section>` : ""}

  <section class="view" data-view="flat">
    ${renderTableView(result.links)}
  </section>

  <footer class="report-footer">
    Generated by <a href="https://github.com/ssandeep104/html-link-analyzer" target="_blank" rel="noopener">html-link-analyzer</a>
  </footer>
</div>

<script>
(function () {
  var searchEl = document.getElementById('search');
  var typeEl = document.getElementById('typeFilter');
  var tabsButtons = document.querySelectorAll('.view-tabs button');
  var views = document.querySelectorAll('.view');

  function applyFilters() {
    var q = (searchEl.value || '').toLowerCase().trim();
    var t = typeEl.value;

    // Filter individual link rows (domain + flat views) and table rows
    var rows = document.querySelectorAll('.link-row, .flat-table tbody tr');
    rows.forEach(function (row) {
      var hay = row.getAttribute('data-search') || '';
      var rt = row.getAttribute('data-type') || '';
      var matchQ = !q || hay.indexOf(q) !== -1;
      var matchT = t === 'all' || rt === t;
      row.hidden = !(matchQ && matchT);
    });

    // Hide empty domain cards
    document.querySelectorAll('.domain-card').forEach(function (card) {
      var visible = card.querySelectorAll('.link-row:not([hidden])').length;
      // If a card has no link rows (only headings), fall back to data-search match on the card itself
      if (visible === 0) {
        var ds = card.getAttribute('data-search') || '';
        if (q && ds.indexOf(q) === -1) { card.hidden = true; return; }
      }
      card.hidden = visible === 0 && (q || t !== 'all');
    });
  }

  searchEl.addEventListener('input', applyFilters);
  typeEl.addEventListener('change', applyFilters);

  tabsButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var target = btn.getAttribute('data-view');
      tabsButtons.forEach(function (b) { b.classList.toggle('active', b === btn); });
      views.forEach(function (v) { v.classList.toggle('active', v.getAttribute('data-view') === target); });
    });
  });
})();
</script>
</body>
</html>`;
}

export function ExportBar({ result }: ExportBarProps) {
  const { toast } = useToast();

  const handleExportCSV = () => {
    try {
      const headers = ['id', 'text', 'href', 'resolved_href', 'type', 'domain', 'host', 'section', 'heading', 'position'];
      const csvContent = [
        headers.join(','),
        ...result.links.map((link) =>
          headers
            .map((header) => {
              const val = link[header as keyof typeof link];
              if (val === null || val === undefined) return '""';
              return `"${String(val).replace(/"/g, '""')}"`;
            })
            .join(','),
        ),
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      downloadBlob(blob, `links-export-${Date.now()}.csv`);
    } catch {
      toast({ title: 'Export Failed', description: 'Failed to generate CSV', variant: 'destructive' });
    }
  };

  const handleExportJSON = () => {
    try {
      const jsonContent = JSON.stringify(result, null, 2);
      const blob = new Blob([jsonContent], { type: 'application/json' });
      downloadBlob(blob, `links-export-${Date.now()}.json`);
    } catch {
      toast({ title: 'Export Failed', description: 'Failed to generate JSON', variant: 'destructive' });
    }
  };

  const handleExportHTML = () => {
    try {
      const htmlContent = buildHtmlReport(result);
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
      downloadBlob(blob, `links-report-${Date.now()}.html`);
    } catch {
      toast({ title: 'Export Failed', description: 'Failed to generate HTML report', variant: 'destructive' });
    }
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: 'Export Successful', description: `Downloaded ${filename}` });
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground mr-2 font-medium">Export:</span>
      <Button variant="outline" size="sm" onClick={handleExportCSV} className="h-8 gap-2 bg-background">
        <Download className="w-3.5 h-3.5" /> CSV
      </Button>
      <Button variant="outline" size="sm" onClick={handleExportJSON} className="h-8 gap-2 bg-background">
        <FileJson className="w-3.5 h-3.5" /> JSON
      </Button>
      <Button variant="outline" size="sm" onClick={handleExportHTML} className="h-8 gap-2 bg-background">
        <FileCode2 className="w-3.5 h-3.5" /> HTML Report
      </Button>
    </div>
  );
}
