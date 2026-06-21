import { useState, useMemo } from "react";
import { ParseResult, ParsedLink, ParsedLinkType } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search,
  FolderTree,
  Table2,
  Link2,
  ExternalLink,
  Hash,
  Workflow,
  ExternalLink as ExternalIcon,
  Globe2,
} from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface LinkViewerProps {
  result: ParseResult;
}

type ViewMode = "domain" | "section" | "flat";

const getTypeColor = (type: ParsedLinkType) => {
  switch (type) {
    case 'internal': return "bg-teal-500/15 text-teal-500 border-teal-500/30";
    case 'external': return "bg-amber-500/15 text-amber-500 border-amber-500/30";
    case 'special': return "bg-purple-500/15 text-purple-500 border-purple-500/30";
    case 'anchor': return "bg-gray-500/15 text-gray-400 border-gray-500/30";
    default: return "bg-muted text-muted-foreground";
  }
};

const getTypeIcon = (type: ParsedLinkType) => {
  switch (type) {
    case 'internal': return <Link2 className="w-3 h-3 mr-1" />;
    case 'external': return <ExternalLink className="w-3 h-3 mr-1" />;
    case 'special': return <Workflow className="w-3 h-3 mr-1" />;
    case 'anchor': return <Hash className="w-3 h-3 mr-1" />;
    default: return null;
  }
};

function matchesFilters(link: ParsedLink, search: string, typeFilter: string): boolean {
  const matchSearch =
    !search ||
    link.text.toLowerCase().includes(search.toLowerCase()) ||
    link.href.toLowerCase().includes(search.toLowerCase()) ||
    (link.domain ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (link.host ?? "").toLowerCase().includes(search.toLowerCase());
  const matchType = typeFilter === "all" || link.type === typeFilter;
  return matchSearch && matchType;
}

function LinkRow({ link, showDomain }: { link: ParsedLink; showDomain?: boolean }) {
  return (
    <div className="p-3 px-4 hover:bg-muted/30 transition-colors flex items-start sm:items-center gap-4 group">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground truncate pr-4">
          {link.text || <span className="text-muted-foreground italic">No text content</span>}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-muted-foreground font-mono truncate max-w-full" title={link.href}>
            {link.href}
          </span>
          {showDomain && link.host && link.host !== link.domain && (
            <Badge variant="outline" className="font-mono text-[10px] rounded-sm px-1 py-0 border-border/40 text-muted-foreground">
              {link.host}
            </Badge>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <Badge variant="outline" className={`font-mono text-[10px] uppercase tracking-wider rounded-sm px-1.5 py-0 border ${getTypeColor(link.type)}`}>
          {getTypeIcon(link.type)}
          {link.type}
        </Badge>
        <a href={link.resolved_href} target="_blank" rel="noopener noreferrer" className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground">
          <ExternalIcon className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
}

export function LinkViewer({ result }: LinkViewerProps) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  // Domain is the default view — most useful for URL dumps and external-link audits.
  const [viewMode, setViewMode] = useState<ViewMode>("domain");

  const filteredLinks = useMemo(
    () => result.links.filter((l) => matchesFilters(l, search, typeFilter)),
    [result.links, search, typeFilter],
  );

  const filteredDomainGroups = useMemo(() => {
    return result.grouped_by_domain
      .map((g) => ({
        ...g,
        links: g.links.filter((l) => matchesFilters(l, search, typeFilter)),
      }))
      .filter((g) => g.links.length > 0)
      .map((g) => ({ ...g, count: g.links.length }));
  }, [result.grouped_by_domain, search, typeFilter]);

  const maxDomainCount = useMemo(
    () => filteredDomainGroups.reduce((m, g) => Math.max(m, g.count), 0),
    [filteredDomainGroups],
  );

  const filteredGrouped = useMemo(() => {
    return result.grouped
      .map((section) => {
        const filteredHeadings = section.headings
          .map((h) => ({
            ...h,
            links: h.links.filter((l) => matchesFilters(l, search, typeFilter)),
          }))
          .filter((h) => h.links.length > 0);
        return { ...section, headings: filteredHeadings };
      })
      .filter((s) => s.headings.length > 0);
  }, [result.grouped, search, typeFilter]);

  // If the result has no DOM grouping (URL-list mode), hide the Section tab.
  const hasSectionGrouping = result.grouped.length > 0;

  return (
    <div className="flex flex-col h-full min-h-[600px]">
      <div className="p-4 border-b border-border/50 bg-card flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center sticky top-14 z-10 shadow-sm">
        <div className="flex flex-1 gap-3 w-full sm:w-auto">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Filter by text, href, or domain..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10 font-mono text-sm bg-background border-border/50"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[140px] h-10 bg-background border-border/50">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="internal">Internal</SelectItem>
              <SelectItem value="external">External</SelectItem>
              <SelectItem value="anchor">Anchor</SelectItem>
              <SelectItem value="special">Special</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)} className="w-full sm:w-auto">
          <TabsList className={`grid w-full sm:w-auto ${hasSectionGrouping ? "grid-cols-3" : "grid-cols-2"} bg-muted/50 border border-border/50`}>
            <TabsTrigger value="domain" className="gap-2 text-xs">
              <Globe2 className="w-3.5 h-3.5" /> Domain
            </TabsTrigger>
            {hasSectionGrouping && (
              <TabsTrigger value="section" className="gap-2 text-xs">
                <FolderTree className="w-3.5 h-3.5" /> Section
              </TabsTrigger>
            )}
            <TabsTrigger value="flat" className="gap-2 text-xs">
              <Table2 className="w-3.5 h-3.5" /> Table
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex-1 bg-background/50 overflow-auto p-4 sm:p-6">
        {filteredLinks.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground py-20">
            <Search className="w-12 h-12 mb-4 opacity-20" />
            <p className="text-lg font-medium">No links found</p>
            <p className="text-sm">Try adjusting your filters or search query.</p>
          </div>
        ) : viewMode === "domain" ? (
          <Accordion
            type="multiple"
            defaultValue={filteredDomainGroups.slice(0, 8).map((g) => g.domain || "(no-host)")}
            className="space-y-3"
          >
            {filteredDomainGroups.map((group) => {
              const key = group.domain || "(no-host)";
              const widthPct = maxDomainCount > 0 ? Math.max(4, (group.count / maxDomainCount) * 100) : 0;
              return (
                <AccordionItem
                  key={key}
                  value={key}
                  className="border border-border/50 rounded-lg bg-card overflow-hidden"
                >
                  <AccordionTrigger className="px-4 py-3 hover:bg-muted/30 transition-colors data-[state=open]:border-b data-[state=open]:border-border/50">
                    <div className="flex items-center gap-3 w-full pr-4">
                      {group.domain ? (
                        <img
                          src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(group.domain)}&sz=32`}
                          alt=""
                          width={16}
                          height={16}
                          className="rounded-sm flex-shrink-0"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
                          }}
                        />
                      ) : (
                        <Hash className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      )}
                      <span className="font-semibold text-foreground tracking-tight text-sm truncate">
                        {group.domain || "Anchors & non-HTTP"}
                      </span>
                      {group.hosts.length > 1 && (
                        <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0 border-border/40 text-muted-foreground">
                          {group.hosts.length} hosts
                        </Badge>
                      )}
                      <div className="flex-1 flex items-center gap-2 min-w-0">
                        <div className="hidden sm:block flex-1 max-w-[200px] h-1.5 bg-muted/40 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary/60 rounded-full"
                            style={{ width: `${widthPct}%` }}
                          />
                        </div>
                      </div>
                      <Badge variant="secondary" className="bg-muted text-muted-foreground font-mono text-xs rounded-full">
                        {group.count}
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="p-0 bg-background/50">
                    <div className="divide-y divide-border/20">
                      {group.links.map((link) => (
                        <LinkRow key={link.id} link={link} showDomain />
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        ) : viewMode === "section" ? (
          <Accordion type="multiple" defaultValue={filteredGrouped.map(s => s.section)} className="space-y-4">
            {filteredGrouped.map((section, idx) => (
              <AccordionItem key={idx} value={section.section} className="border border-border/50 rounded-lg bg-card overflow-hidden">
                <AccordionTrigger className="px-4 py-3 hover:bg-muted/30 transition-colors data-[state=open]:border-b data-[state=open]:border-border/50">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-foreground capitalize tracking-wider text-sm">{section.section || "Unsectioned"}</span>
                    <Badge variant="secondary" className="bg-muted text-muted-foreground font-mono text-xs rounded-full">
                      {section.headings.reduce((acc, h) => acc + h.links.length, 0)}
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="p-0 bg-background/50">
                  {section.headings.map((heading, hIdx) => (
                    <div key={hIdx} className="border-b border-border/30 last:border-0">
                      {heading.heading && (
                        <div className="bg-muted/20 px-4 py-2 text-xs font-semibold text-muted-foreground border-b border-border/30 uppercase tracking-wider sticky top-0">
                          {heading.heading}
                        </div>
                      )}
                      <div className="divide-y divide-border/20">
                        {heading.links.map(link => (
                          <LinkRow key={link.id} link={link} />
                        ))}
                      </div>
                    </div>
                  ))}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        ) : (
          <div className="border border-border/50 rounded-lg overflow-hidden bg-card">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-12 font-mono text-xs text-center">#</TableHead>
                  <TableHead className="w-[25%]">Text</TableHead>
                  <TableHead className="w-[30%]">Href</TableHead>
                  <TableHead className="w-[18%]">Domain</TableHead>
                  <TableHead className="w-24">Type</TableHead>
                  <TableHead className="w-28">Section</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLinks.map((link) => (
                  <TableRow key={link.id} className="hover:bg-muted/30 group">
                    <TableCell className="font-mono text-xs text-muted-foreground text-center">{link.position}</TableCell>
                    <TableCell className="font-medium text-sm truncate max-w-[200px]" title={link.text}>{link.text || <span className="text-muted-foreground italic">No text</span>}</TableCell>
                    <TableCell className="font-mono text-xs truncate max-w-[250px]" title={link.href}>
                      <a href={link.resolved_href} target="_blank" rel="noopener noreferrer" className="hover:text-primary hover:underline flex items-center gap-1">
                        {link.href}
                        <ExternalIcon className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </a>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground truncate max-w-[160px]" title={link.host || ""}>
                      {link.domain || <span className="italic text-muted-foreground/60">—</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`font-mono text-[10px] uppercase tracking-wider rounded-sm px-1.5 py-0 border ${getTypeColor(link.type)}`}>
                        {link.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground capitalize">
                      {link.section || '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
