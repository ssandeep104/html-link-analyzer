import { useState } from "react";
import { InputPanel } from "@/components/InputPanel";
import { MetricsDashboard } from "@/components/MetricsDashboard";
import { LinkViewer } from "@/components/LinkViewer";
import { ExportBar } from "@/components/ExportBar";
import { ParseResult } from "@workspace/api-client-react";
import { Terminal, Activity } from "lucide-react";

export default function Home() {
  const [result, setResult] = useState<ParseResult | null>(null);

  return (
    <div className="min-h-screen w-full bg-background flex flex-col font-sans">
      <header className="border-b border-border/40 bg-card/50 backdrop-blur sticky top-0 z-10">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-primary/10 text-primary p-1.5 rounded-md">
              <Terminal className="w-5 h-5" />
            </div>
            <h1 className="font-semibold text-foreground tracking-tight flex items-center gap-2">
              LinkScan <span className="text-muted-foreground font-mono text-xs px-1.5 py-0.5 rounded-sm bg-muted/50 border border-border/50">v1.0.0</span>
            </h1>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground font-mono">
            <span className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" />
              Ready
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-8 max-w-6xl space-y-8">
        <InputPanel onParse={setResult} />
        
        {result ? (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
            <MetricsDashboard metrics={result.metrics} />
            
            <div className="bg-card border border-border/50 rounded-xl overflow-hidden shadow-sm flex flex-col">
              <div className="border-b border-border/50 bg-muted/30 p-4">
                <ExportBar result={result} />
              </div>
              <div className="p-0">
                <LinkViewer result={result} />
              </div>
            </div>
          </div>
        ) : (
          <div className="py-24 text-center px-4 animate-in fade-in duration-500">
            <div className="bg-muted/30 border border-border/50 rounded-2xl p-8 max-w-2xl mx-auto shadow-sm backdrop-blur">
              <div className="bg-background/80 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-sm border border-border/50 text-muted-foreground">
                <Activity className="w-8 h-8 opacity-50" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Ready to Analyze</h2>
              <p className="text-muted-foreground mb-6 text-sm max-w-md mx-auto">
                Enter a URL or upload an HTML file to extract, categorize, and inspect all links within the document.
              </p>
              <div className="bg-background/50 border border-border/50 rounded-lg p-4 inline-flex flex-col items-start text-left text-sm text-muted-foreground font-mono">
                <div className="font-semibold text-foreground mb-2 font-sans text-xs uppercase tracking-wider">Example Usage</div>
                <div>1. Paste URL: <span className="text-primary">https://example.com</span></div>
                <div>2. Wait for parsing to complete</div>
                <div>3. Inspect Internal, External, and Special links</div>
                <div>4. Export as CSV, JSON, or self-contained HTML</div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
