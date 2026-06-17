import { forwardRef, useImperativeHandle, useState, useRef } from "react";
import { useParseUrl, useParseFile, ParseResult } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Globe, FileCode, Search, UploadCloud, Loader2, Link as LinkIcon, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface InputPanelProps {
  onParse: (result: ParseResult) => void;
}

export interface InputPanelHandle {
  /** Programmatically populate the URL field and submit. */
  setUrlAndSubmit: (url: string) => void;
}

export const InputPanel = forwardRef<InputPanelHandle, InputPanelProps>(
  function InputPanel({ onParse }, ref) {
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { toast } = useToast();
  const parseUrlMutation = useParseUrl();
  const parseFileMutation = useParseFile();

  const isPending = parseUrlMutation.isPending || parseFileMutation.isPending;

  useImperativeHandle(ref, () => ({
    setUrlAndSubmit: (newUrl: string) => {
      setUrl(newUrl);
      parseUrlMutation.mutate(
        { data: { url: newUrl } },
        {
          onSuccess: (res) => onParse(res),
          onError: (err) => {
            toast({
              variant: "destructive",
              title: "Parsing Failed",
              description: err.data?.error || "Failed to parse URL",
            });
          },
        },
      );
    },
  }));

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    
    parseUrlMutation.mutate({ data: { url } }, {
      onSuccess: (res) => onParse(res),
      onError: (err) => {
        toast({
          variant: "destructive",
          title: "Parsing Failed",
          description: err.data?.error || "Failed to parse URL",
        });
      }
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) setFile(selected);
  };

  const handleFileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    const isWebArchive = file.name.toLowerCase().endsWith(".webarchive");

    if (isWebArchive) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        const bytes = new Uint8Array(arrayBuffer);
        let binary = "";
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        const b64 = btoa(binary);
        parseFileMutation.mutate(
          { data: { file_content_b64: b64, filename: file.name } },
          {
            onSuccess: (res) => onParse(res),
            onError: (err) => {
              toast({
                variant: "destructive",
                title: "Parsing Failed",
                description: err.data?.error || "Failed to parse file",
              });
            }
          }
        );
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        parseFileMutation.mutate(
          { data: { html_content: content, filename: file.name } },
          {
            onSuccess: (res) => onParse(res),
            onError: (err) => {
              toast({
                variant: "destructive",
                title: "Parsing Failed",
                description: err.data?.error || "Failed to parse file",
              });
            }
          }
        );
      };
      reader.readAsText(file);
    }
  };

  return (
    <Card className="border-border/50 shadow-sm bg-card/40 backdrop-blur">
      <CardContent className="p-6">
        <Tabs defaultValue="url" className="w-full">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
                <Search className="w-5 h-5 text-muted-foreground" />
                Target Source
              </h2>
              <p className="text-sm text-muted-foreground">Select a URL, HTML file, or Safari Web Archive to analyze its links structure.</p>
            </div>
            <TabsList className="bg-muted/50 border border-border/50">
              <TabsTrigger value="url" className="gap-2 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm">
                <Globe className="w-4 h-4" /> URL
              </TabsTrigger>
              <TabsTrigger value="file" className="gap-2 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm">
                <FileCode className="w-4 h-4" /> File
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="url" className="mt-0 outline-none">
            <form onSubmit={handleUrlSubmit} className="flex gap-3">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <LinkIcon className="h-4 w-4 text-muted-foreground" />
                </div>
                <Input 
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="pl-10 h-12 bg-background font-mono text-sm border-border/50 focus-visible:ring-primary/30"
                  disabled={isPending}
                />
              </div>
              <Button type="submit" size="lg" disabled={!url || isPending} className="px-8 font-medium">
                {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Analyze
              </Button>
            </form>
            {parseUrlMutation.isError && (
               <Alert variant="destructive" className="mt-4 bg-destructive/10 text-destructive border-destructive/20">
                 <AlertCircle className="h-4 w-4" />
                 <AlertTitle>Error</AlertTitle>
                 <AlertDescription>{parseUrlMutation.error?.data?.error || "An unknown error occurred"}</AlertDescription>
               </Alert>
            )}
          </TabsContent>

          <TabsContent value="file" className="mt-0 outline-none">
            <form onSubmit={handleFileSubmit} className="space-y-4">
              <div 
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${dragActive ? 'border-primary bg-primary/5' : 'border-border/50 bg-background/50 hover:bg-muted/30 hover:border-border'} cursor-pointer`}
                onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  if (e.dataTransfer.files?.[0]) setFile(e.dataTransfer.files[0]);
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  className="hidden" 
                  accept=".html,.htm,.webarchive" 
                />
                
                <div className="flex flex-col items-center gap-2">
                  <div className="p-3 bg-muted rounded-full">
                    <UploadCloud className="w-6 h-6 text-muted-foreground" />
                  </div>
                  {file ? (
                    <div>
                      <p className="font-medium text-foreground">{file.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{(file.size / 1024).toFixed(1)} KB</p>
                    </div>
                  ) : (
                    <div>
                      <p className="font-medium text-foreground">Click or drag file here</p>
                      <p className="text-xs text-muted-foreground mt-1">Supports .html, .htm, .webarchive</p>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="submit" size="lg" disabled={!file || isPending} className="px-8 font-medium">
                  {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Analyze File
                </Button>
              </div>
            </form>
             {parseFileMutation.isError && (
               <Alert variant="destructive" className="mt-4 bg-destructive/10 text-destructive border-destructive/20">
                 <AlertCircle className="h-4 w-4" />
                 <AlertTitle>Error</AlertTitle>
                 <AlertDescription>{parseFileMutation.error?.data?.error || "An unknown error occurred"}</AlertDescription>
               </Alert>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
  },
);
