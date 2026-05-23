import { useEffect, useMemo, useState } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { ScrapedPage, Heading } from "@/lib/types";

interface Hit {
  pageIdx: number;
  page: ScrapedPage;
  type: "page" | "heading" | "match";
  heading?: Heading;
  preview?: string;
  anchorId?: string;
}

interface Props {
  pages: ScrapedPage[];
  onJump: (anchorId: string) => void;
  onScrollToPage: (pageIdx: number) => void;
}

export default function CommandSearch({ pages, onJump, onScrollToPage }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const hits = useMemo<Hit[]>(() => {
    if (!q.trim()) {
      // Show pages + headings as default
      const out: Hit[] = [];
      pages.forEach((p, i) => {
        out.push({ pageIdx: i, page: p, type: "page" });
        for (const h of p.headings.slice(0, 5)) {
          out.push({
            pageIdx: i,
            page: p,
            type: "heading",
            heading: h,
            anchorId: h.id,
          });
        }
      });
      return out.slice(0, 50);
    }
    const needle = q.toLowerCase();
    const out: Hit[] = [];
    pages.forEach((p, i) => {
      if (p.title.toLowerCase().includes(needle)) {
        out.push({ pageIdx: i, page: p, type: "page" });
      }
      for (const h of p.headings) {
        if (h.text.toLowerCase().includes(needle)) {
          out.push({
            pageIdx: i,
            page: p,
            type: "heading",
            heading: h,
            anchorId: h.id,
          });
        }
      }
      const md = p.markdown.toLowerCase();
      let idx = md.indexOf(needle);
      let count = 0;
      while (idx !== -1 && count < 2) {
        const start = Math.max(0, idx - 40);
        const end = Math.min(md.length, idx + needle.length + 40);
        out.push({
          pageIdx: i,
          page: p,
          type: "match",
          preview: p.markdown.slice(start, end).replace(/\s+/g, " "),
        });
        idx = md.indexOf(needle, idx + needle.length);
        count++;
      }
    });
    return out.slice(0, 80);
  }, [q, pages]);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        value={q}
        onValueChange={setQ}
        placeholder="Search pages, headings, or text…"
        data-testid="cmdk-input"
      />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup heading={q ? "Results" : "Outline"}>
          {hits.map((hit, i) => (
            <CommandItem
              key={i}
              value={`${i}-${hit.page.url}-${hit.heading?.id || ""}-${hit.preview || ""}`}
              onSelect={() => {
                if (hit.anchorId) onJump(hit.anchorId);
                else onScrollToPage(hit.pageIdx);
                setOpen(false);
              }}
              data-testid="cmdk-item"
            >
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted-foreground truncate">
                  {hit.page.title}
                </div>
                {hit.type === "heading" && hit.heading && (
                  <div
                    className="font-medium truncate"
                    style={{ paddingLeft: `${(hit.heading.level - 1) * 8}px` }}
                  >
                    {hit.heading.text}
                  </div>
                )}
                {hit.type === "page" && (
                  <div className="font-medium truncate">{hit.page.title}</div>
                )}
                {hit.type === "match" && (
                  <div className="text-sm truncate">{hit.preview}</div>
                )}
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
