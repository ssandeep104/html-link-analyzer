import { PageAnalysis } from "@workspace/api-client-react";
import { CheckCircle2, XCircle, Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface PageResultsProps {
  pages: PageAnalysis[];
}

/**
 * Per-page breakdown for a batch (URL-list fetch) result: which pages were
 * analyzed, how many links each yielded, and which ones failed (without
 * sinking the rest of the batch).
 */
export function PageResults({ pages }: PageResultsProps) {
  const ok = pages.filter((p) => p.status === "ok").length;

  return (
    <div className="bg-card border border-border/50 rounded-xl overflow-hidden shadow-sm">
      <div className="border-b border-border/50 bg-muted/30 p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold tracking-tight">Pages analyzed</h2>
        </div>
        <Badge
          variant="secondary"
          className="bg-muted text-muted-foreground font-mono text-xs rounded-full"
        >
          {ok}/{pages.length} succeeded
        </Badge>
      </div>
      <div className="divide-y divide-border/20 max-h-72 overflow-auto">
        {pages.map((page, i) => (
          <div key={i} className="px-4 py-2.5 flex items-center gap-3">
            {page.status === "ok" ? (
              <CheckCircle2 className="w-4 h-4 text-teal-500 shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 text-destructive shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-mono text-foreground truncate" title={page.url}>
                {page.url}
              </p>
              {page.status === "error" && page.error && (
                <p className="text-xs text-destructive/80 truncate" title={page.error}>
                  {page.error}
                </p>
              )}
            </div>
            {page.status === "ok" ? (
              <Badge
                variant="secondary"
                className="bg-muted text-muted-foreground font-mono text-xs rounded-full shrink-0"
              >
                {page.links ?? 0} links
              </Badge>
            ) : (
              page.code && (
                <Badge
                  variant="outline"
                  className="font-mono text-[10px] rounded-sm px-1.5 py-0 border-border/40 text-muted-foreground shrink-0"
                >
                  {page.code}
                </Badge>
              )
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
