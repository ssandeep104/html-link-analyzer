import { ParseResult } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Download, FileJson, FileCode2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ExportBarProps {
  result: ParseResult;
}

export function ExportBar({ result }: ExportBarProps) {
  const { toast } = useToast();

  const handleExportCSV = () => {
    try {
      const headers = ['id', 'text', 'href', 'resolved_href', 'type', 'domain', 'host', 'section', 'heading', 'position'];
      const csvContent = [
        headers.join(','),
        ...result.links.map(link => 
          headers.map(header => {
            const val = link[header as keyof typeof link];
            if (val === null || val === undefined) return '""';
            return `"${String(val).replace(/"/g, '""')}"`;
          }).join(',')
        )
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      downloadBlob(blob, `links-export-${Date.now()}.csv`);
    } catch (err) {
      toast({ title: "Export Failed", description: "Failed to generate CSV", variant: "destructive" });
    }
  };

  const handleExportJSON = () => {
    try {
      const jsonContent = JSON.stringify(result, null, 2);
      const blob = new Blob([jsonContent], { type: 'application/json' });
      downloadBlob(blob, `links-export-${Date.now()}.json`);
    } catch (err) {
      toast({ title: "Export Failed", description: "Failed to generate JSON", variant: "destructive" });
    }
  };

  const handleExportHTML = () => {
    try {
      const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Link Report: ${result.source}</title>
    <style>
        body { font-family: system-ui, -apple-system, sans-serif; background: #09090b; color: #ededed; margin: 0; padding: 2rem; }
        .container { max-width: 1200px; margin: 0 auto; }
        h1 { font-size: 1.5rem; border-bottom: 1px solid #27272a; padding-bottom: 1rem; margin-bottom: 2rem; }
        input { width: 100%; padding: 0.75rem 1rem; margin-bottom: 1.5rem; background: #18181b; border: 1px solid #27272a; color: white; border-radius: 0.5rem; }
        table { width: 100%; border-collapse: collapse; text-align: left; background: #18181b; border-radius: 0.5rem; overflow: hidden; }
        th, td { padding: 0.75rem 1rem; border-bottom: 1px solid #27272a; }
        th { background: #27272a; font-weight: 500; font-size: 0.875rem; color: #a1a1aa; }
        td { font-size: 0.875rem; }
        td.mono { font-family: monospace; color: #a1a1aa; }
        a { color: #3b82f6; text-decoration: none; }
        a:hover { text-decoration: underline; }
        .badge { display: inline-block; padding: 0.125rem 0.5rem; border-radius: 999px; font-size: 0.75rem; font-weight: 500; text-transform: uppercase; border: 1px solid; }
        .internal { background: rgba(20, 184, 166, 0.1); color: #14b8a6; border-color: rgba(20, 184, 166, 0.2); }
        .external { background: rgba(245, 158, 11, 0.1); color: #f59e0b; border-color: rgba(245, 158, 11, 0.2); }
        .special { background: rgba(168, 85, 247, 0.1); color: #a855f7; border-color: rgba(168, 85, 247, 0.2); }
        .anchor { background: rgba(156, 163, 175, 0.1); color: #9ca3af; border-color: rgba(156, 163, 175, 0.2); }
    </style>
</head>
<body>
    <div class="container">
        <h1>Link Report: <span style="color:#a1a1aa; font-family:monospace;">${result.source}</span></h1>
        <input type="text" id="search" placeholder="Search links..." onkeyup="filterLinks()">
        <table id="linksTable">
            <thead>
                <tr>
                    <th>#</th>
                    <th>Text</th>
                    <th>Href</th>
                    <th>Domain</th>
                    <th>Type</th>
                    <th>Section</th>
                </tr>
            </thead>
            <tbody>
                ${result.links.map(link => `
                <tr>
                    <td class="mono">${link.position}</td>
                    <td>${link.text || '<em>No text</em>'}</td>
                    <td class="mono"><a href="${link.resolved_href}" target="_blank">${link.href}</a></td>
                    <td class="mono" style="color:#a1a1aa;">${link.domain || '-'}</td>
                    <td><span class="badge ${link.type}">${link.type}</span></td>
                    <td style="color:#a1a1aa;text-transform:capitalize;">${link.section || '-'}</td>
                </tr>
                `).join('')}
            </tbody>
        </table>
    </div>
    <script>
        function filterLinks() {
            const input = document.getElementById('search');
            const filter = input.value.toLowerCase();
            const trs = document.getElementById('linksTable').getElementsByTagName('tr');
            
            for (let i = 1; i < trs.length; i++) {
                const text = trs[i].textContent || trs[i].innerText;
                trs[i].style.display = text.toLowerCase().indexOf(filter) > -1 ? "" : "none";
            }
        }
    </script>
</body>
</html>
      `;
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
      downloadBlob(blob, `links-report-${Date.now()}.html`);
    } catch (err) {
      toast({ title: "Export Failed", description: "Failed to generate HTML report", variant: "destructive" });
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
    toast({ title: "Export Successful", description: `Downloaded ${filename}` });
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
