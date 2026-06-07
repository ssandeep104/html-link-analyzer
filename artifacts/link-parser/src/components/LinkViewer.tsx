import { useState, useMemo } from "react";
import { ParseResult, ParsedLink, ParsedLinkType } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, FolderTree, Table2, Link2, ExternalLink, Hash, Workflow, ExternalLink as ExternalIcon } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface LinkViewerProps {
  result: ParseResult;
}

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

export function LinkViewer({ result }: LinkViewerProps) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grouped" | "flat">("grouped");

  const filteredLinks = useMemo(() => {
    return result.links.filter(link => {
      const matchSearch = link.text.toLowerCase().includes(search.toLowerCase()) || 
                          link.href.toLowerCase().includes(search.toLowerCase());
      const matchType = typeFilter === "all" || link.type === typeFilter;
      return matchSearch && matchType;
    });
  }, [result.links, search, typeFilter]);

  const filteredGrouped = useMemo(() => {
    if (!search && typeFilter === "all") return result.grouped;
    
    return result.grouped.map(section => {
      const filteredHeadings = section.headings.map(h => ({
        ...h,
        links: h.links.filter(link => {
          const matchSearch = link.text.toLowerCase().includes(search.toLowerCase()) || 
                              link.href.toLowerCase().includes(search.toLowerCase());
          const matchType = typeFilter === "all" || link.type === typeFilter;
          return matchSearch && matchType;
        })
      })).filter(h => h.links.length > 0);
      return { ...section, headings: filteredHeadings };
    }).filter(s => s.headings.length > 0);
  }, [result.grouped, search, typeFilter]);

  return (
    <div className="flex flex-col h-full min-h-[600px]">
      <div className="p-4 border-b border-border/50 bg-card flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center sticky top-14 z-10 shadow-sm">
        <div className="flex flex-1 gap-3 w-full sm:w-auto">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Filter by text or href..."
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
        
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)} className="w-full sm:w-auto">
          <TabsList className="grid w-full sm:w-auto grid-cols-2 bg-muted/50 border border-border/50">
            <TabsTrigger value="grouped" className="gap-2 text-xs">
              <FolderTree className="w-3.5 h-3.5" /> Grouped
            </TabsTrigger>
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
        ) : viewMode === "grouped" ? (
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
                          <div key={link.id} className="p-3 px-4 hover:bg-muted/30 transition-colors flex items-start sm:items-center gap-4 group">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-foreground truncate pr-4">{link.text || <span className="text-muted-foreground italic">No text content</span>}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs text-muted-foreground font-mono truncate max-w-full" title={link.href}>{link.href}</span>
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
                  <TableHead className="w-[30%]">Text</TableHead>
                  <TableHead className="w-[30%]">Href</TableHead>
                  <TableHead className="w-24">Type</TableHead>
                  <TableHead className="w-32">Section</TableHead>
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
