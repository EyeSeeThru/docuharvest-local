import { useEffect, useMemo, useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Maximize2, Minimize2, Copy, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { renderMarkdown } from "@/lib/markdown";
import type { Heading, ScrapedPage } from "@/lib/types";

interface Props {
  pages: ScrapedPage[];
  title: string;
  baseUrl: string;
  fullScreen: boolean;
  onToggleFullScreen: () => void;
}

interface SectionInfo {
  pageIdx: number;
  page: ScrapedPage;
  html: string;
  headings: Heading[];
}

function buildToC(sections: SectionInfo[]) {
  // Flat list of (id, text, level) in document order; we group by page anchor
  return sections.map((s, idx) => ({
    pageId: `page-${idx}`,
    title: s.page.title,
    headings: s.headings,
  }));
}

export default function PreviewPane({
  pages,
  title,
  baseUrl,
  fullScreen,
  onToggleFullScreen,
}: Props) {
  const { toast } = useToast();
  const [activeId, setActiveId] = useState<string>("");
  const [copied, setCopied] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);

  const sections = useMemo<SectionInfo[]>(() => {
    return pages
      .filter((p) => p.ok && p.markdown)
      .map((p, idx) => {
        const r = renderMarkdown(p.markdown);
        return {
          pageIdx: idx,
          page: p,
          html: r.html,
          headings: r.headings,
        };
      });
  }, [pages]);

  const toc = useMemo(() => buildToC(sections), [sections]);

  const fullMarkdown = useMemo(() => {
    return sections
      .map((s) => `## ${s.page.title}\n\n_Source: ${s.page.url}_\n\n${s.page.markdown}`)
      .join("\n\n---\n\n");
  }, [sections]);

  // Scroll-spy: observe headings + page anchors
  useEffect(() => {
    const root = previewRef.current;
    if (!root) return;
    const targets = root.querySelectorAll<HTMLElement>("[data-spy-id]");
    if (!targets.length) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) {
          const id = (visible[0].target as HTMLElement).dataset.spyId;
          if (id) setActiveId(id);
        }
      },
      {
        root,
        rootMargin: "-10% 0px -75% 0px",
        threshold: [0, 1],
      }
    );
    targets.forEach((t) => obs.observe(t));
    return () => obs.disconnect();
  }, [sections]);

  function jumpTo(id: string) {
    const el = previewRef.current?.querySelector<HTMLElement>(
      `[data-spy-id="${CSS.escape(id)}"]`
    );
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveId(id);
    }
  }

  // Expose for parent (Home) via window event
  useEffect(() => {
    function onJump(e: Event) {
      const id = (e as CustomEvent<string>).detail;
      if (id) jumpTo(id);
    }
    window.addEventListener("docuharvest:jump", onJump as EventListener);
    return () =>
      window.removeEventListener("docuharvest:jump", onJump as EventListener);
  }, []);

  async function copyText(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  }

  return (
    <div
      className={`flex flex-col rounded-lg border bg-card ${
        fullScreen ? "fixed inset-3 z-40 shadow-2xl" : "h-full"
      }`}
      data-testid="preview-pane"
    >
      <Tabs defaultValue="preview" className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center gap-2 p-2 border-b">
          <TabsList>
            <TabsTrigger value="preview" data-testid="tab-preview">
              Preview
            </TabsTrigger>
            <TabsTrigger value="markdown" data-testid="tab-markdown">
              Markdown
            </TabsTrigger>
          </TabsList>
          <div className="flex-1 truncate text-xs text-muted-foreground px-2">
            {sections.length} pages · {fullMarkdown.length.toLocaleString()} chars
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              copyText("__full__", fullMarkdown).then(() =>
                toast({ title: "Copied full markdown" })
              )
            }
            disabled={!fullMarkdown}
            data-testid="copy-all"
          >
            <Copy className="h-4 w-4 mr-2" />
            Copy
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onToggleFullScreen}
            data-testid="toggle-fullscreen"
          >
            {fullScreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </Button>
        </div>

        <TabsContent
          value="preview"
          className="flex-1 min-h-0 m-0 grid grid-cols-1 md:grid-cols-[15rem_1fr] gap-0"
        >
          {/* ToC */}
          <div className="hidden md:block border-r overflow-hidden">
            <ScrollArea className="h-full">
              <nav
                className="p-3 text-sm space-y-1"
                aria-label="Table of contents"
                data-testid="toc"
              >
                {toc.length === 0 && (
                  <div className="text-muted-foreground text-xs py-4 text-center">
                    Scrape a site to populate the outline.
                  </div>
                )}
                {toc.map((p) => (
                  <div key={p.pageId} className="space-y-0.5">
                    <button
                      type="button"
                      className={`block text-left w-full truncate px-2 py-1 rounded hover:bg-accent ${
                        activeId === p.pageId ? "scroll-spy-active" : ""
                      }`}
                      onClick={() => jumpTo(p.pageId)}
                      title={p.title}
                    >
                      {p.title}
                    </button>
                    {p.headings.map((h) => (
                      <button
                        key={h.id}
                        type="button"
                        className={`block text-left w-full truncate px-2 py-0.5 text-xs rounded hover:bg-accent ${
                          activeId === h.id
                            ? "scroll-spy-active"
                            : "text-muted-foreground"
                        }`}
                        style={{
                          paddingLeft: `${(h.level - 1) * 10 + 8}px`,
                        }}
                        onClick={() => jumpTo(h.id)}
                        title={h.text}
                      >
                        {h.text}
                      </button>
                    ))}
                  </div>
                ))}
              </nav>
            </ScrollArea>
          </div>

          {/* Preview */}
          <ScrollArea className="h-full">
            <div ref={previewRef} className="p-6 md:p-10 max-w-[88ch] mx-auto">
              {sections.length === 0 ? (
                <div className="text-muted-foreground text-sm py-16 text-center">
                  The compiled documentation will stream here as pages are scraped.
                </div>
              ) : (
                <>
                  <header className="mb-6 not-prose">
                    <h1 className="text-3xl font-semibold tracking-tight">
                      {title || "Documentation"}
                    </h1>
                    {baseUrl && (
                      <p className="text-sm text-muted-foreground mt-1 truncate">
                        Source: {baseUrl}
                      </p>
                    )}
                  </header>
                  {sections.map((s, idx) => {
                    const pageId = `page-${idx}`;
                    return (
                      <section
                        key={s.page.url}
                        className="mb-10"
                        data-testid="doc-section"
                      >
                        <div
                          data-spy-id={pageId}
                          className="flex items-center justify-between gap-2 not-prose mb-2"
                        >
                          <div className="min-w-0">
                            <h2
                              id={pageId}
                              className="text-2xl font-semibold tracking-tight"
                            >
                              {s.page.title}
                            </h2>
                            <a
                              href={s.page.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-muted-foreground hover:underline truncate block"
                            >
                              {s.page.url}
                            </a>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              copyText(pageId, s.page.markdown)
                            }
                            data-testid="copy-section"
                            aria-label="Copy section markdown"
                          >
                            {copied === pageId ? (
                              <Check className="h-4 w-4 text-emerald-500" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                        <div
                          className="doc-prose"
                          dangerouslySetInnerHTML={{
                            __html: addSpyAttrs(s.html),
                          }}
                        />
                        {idx < sections.length - 1 && (
                          <hr className="my-8 border-border/60" />
                        )}
                      </section>
                    );
                  })}
                </>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="markdown" className="flex-1 min-h-0 m-0">
          <ScrollArea className="h-full">
            <pre
              className="p-4 text-xs font-mono whitespace-pre-wrap break-words"
              data-testid="markdown-source"
            >
              {fullMarkdown || "// Markdown will appear here as pages are scraped."}
            </pre>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Add data-spy-id attributes to heading elements rendered from markdown
function addSpyAttrs(html: string): string {
  return html.replace(
    /<h([1-6])\s+id="([^"]+)"([^>]*)>/g,
    '<h$1 id="$2" data-spy-id="$2"$3>'
  );
}
