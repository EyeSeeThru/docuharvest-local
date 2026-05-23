import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle2, XCircle, ListChecks, RefreshCw, MinusCircle } from "lucide-react";
import type { ScrapedPage } from "@/lib/types";

interface Props {
  pages: ScrapedPage[];
  onRetryFailed: () => void;
  onRetryOne: (url: string) => void;
  busy?: boolean;
}

export default function PageStatusList({
  pages,
  onRetryFailed,
  onRetryOne,
  busy,
}: Props) {
  const failed = pages.filter((p) => !p.ok);
  const skipped = pages.filter((p) => p.ok && p.skipped);
  const ok = pages.filter((p) => p.ok && !p.skipped);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          data-testid="open-page-list"
        >
          <ListChecks className="h-4 w-4 mr-2" />
          Pages
          {pages.length > 0 && (
            <Badge variant="secondary" className="ml-2">
              {ok.length}/{pages.length}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>Pages</SheetTitle>
        </SheetHeader>

        <div className="flex items-center gap-2 py-3 text-sm">
          <Badge variant="outline" className="border-emerald-500/50 text-emerald-600 dark:text-emerald-400">
            {ok.length} ok
          </Badge>
          <Badge variant="outline" className="border-destructive/50 text-destructive">
            {failed.length} failed
          </Badge>
          {skipped.length > 0 && (
            <Badge variant="outline" className="border-muted-foreground/40 text-muted-foreground">
              {skipped.length} skipped
            </Badge>
          )}
          <div className="flex-1" />
          <Button
            size="sm"
            variant="secondary"
            disabled={!failed.length || busy}
            onClick={onRetryFailed}
            data-testid="retry-failed"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-2" />
            Retry failed
          </Button>
        </div>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <ul className="space-y-1 pb-6">
            {pages.length === 0 && (
              <li className="text-sm text-muted-foreground py-8 text-center">
                No pages scraped yet.
              </li>
            )}
            {pages.map((p) => (
              <li
                key={p.url}
                className="flex items-start gap-2 text-sm border-b border-border/40 py-2"
                data-testid="page-row"
              >
                {p.skipped ? (
                  <MinusCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                ) : p.ok ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate" title={p.title}>
                    {p.title || p.url}
                  </div>
                  <div
                    className="text-xs text-muted-foreground truncate"
                    title={p.url}
                  >
                    {p.url}
                  </div>
                  {!p.ok && p.error && (
                    <div className="text-xs text-destructive truncate">
                      {p.error}
                    </div>
                  )}
                  {p.skipped && (
                    <div className="text-xs text-muted-foreground truncate">
                      Skipped — {p.skipReason || "duplicate"}
                    </div>
                  )}
                </div>
                {!p.ok && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onRetryOne(p.url)}
                    disabled={busy}
                    data-testid="retry-one"
                  >
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
