import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Download,
  FileText,
  FileCode,
  FileJson,
  FileArchive,
  FileType2,
  Bot,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import type { ScrapedPage } from "@/lib/types";

export type ExportFormat =
  | "markdown"
  | "html"
  | "json"
  | "zip"
  | "pdf"
  | "llms";

interface Props {
  title: string;
  baseUrl: string;
  pages: ScrapedPage[];
  disabled?: boolean;
}

export default function ExportMenu({ title, baseUrl, pages, disabled }: Props) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<ExportFormat | null>(null);

  async function exportAs(format: ExportFormat) {
    if (!pages.length) {
      toast({
        title: "Nothing to export",
        description: "Run a scrape first.",
      });
      return;
    }
    setBusy(format);
    try {
      const okPages = pages
        .filter((p) => p.ok && p.markdown)
        .map((p) => ({ url: p.url, title: p.title, markdown: p.markdown }));
      const res = await fetch(`/api/export/${format}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, baseUrl, pages: okPages }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const dispo = res.headers.get("Content-Disposition") || "";
      const fnameMatch = dispo.match(/filename="?([^"]+)"?/i);
      const fname = fnameMatch?.[1] || `documentation.${ext(format)}`;
      const a = document.createElement("a");
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({
        title: `Exported ${fname}`,
        description: `${(blob.size / 1024).toFixed(1)} KB`,
      });
    } catch (e) {
      toast({
        title: "Export failed",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="default"
          size="sm"
          disabled={disabled || !pages.length}
          data-testid="export-menu-trigger"
        >
          <Download className="h-4 w-4 mr-2" />
          {busy ? "Preparing…" : "Export"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Download as</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => exportAs("markdown")}
          data-testid="export-md"
        >
          <FileText className="h-4 w-4 mr-2" />
          Single Markdown (.md)
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => exportAs("zip")}
          data-testid="export-zip"
        >
          <FileArchive className="h-4 w-4 mr-2" />
          Multi-file Zip (.zip)
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => exportAs("html")}
          data-testid="export-html"
        >
          <FileCode className="h-4 w-4 mr-2" />
          HTML
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => exportAs("pdf")}
          data-testid="export-pdf"
        >
          <FileType2 className="h-4 w-4 mr-2" />
          PDF
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => exportAs("json")}
          data-testid="export-json"
        >
          <FileJson className="h-4 w-4 mr-2" />
          JSON
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => exportAs("llms")}
          data-testid="export-llms"
        >
          <Bot className="h-4 w-4 mr-2" />
          llms.txt
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ext(f: ExportFormat): string {
  switch (f) {
    case "markdown":
      return "md";
    case "html":
      return "html";
    case "json":
      return "json";
    case "zip":
      return "zip";
    case "pdf":
      return "pdf";
    case "llms":
      return "txt";
  }
}
