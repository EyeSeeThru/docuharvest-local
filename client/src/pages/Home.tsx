import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Moon, Sun, Play, Square, BookText, Command as CmdIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/lib/useTheme";
import {
  DEFAULT_OPTIONS,
  type JobProgress,
  type ScrapedPage,
  type ScrapeOptions,
  type WSMessage,
} from "@/lib/types";
import ProgressBar from "@/components/ProgressBar";
import PreviewPane from "@/components/PreviewPane";
import SettingsDrawer from "@/components/SettingsDrawer";
import ExportMenu from "@/components/ExportMenu";
import PageStatusList from "@/components/PageStatusList";
import CommandSearch from "@/components/CommandSearch";

const idleProgress: JobProgress = {
  jobId: "",
  status: "idle",
  pagesScraped: 0,
  pagesFailed: 0,
  pagesQueued: 0,
  currentUrl: "",
};

export default function Home() {
  const { theme, toggle: toggleTheme } = useTheme();
  const { toast } = useToast();

  const [url, setUrl] = useState("");
  const [options, setOptions] = useState<ScrapeOptions>(DEFAULT_OPTIONS);
  const [progress, setProgress] = useState<JobProgress>(idleProgress);
  const [pages, setPages] = useState<ScrapedPage[]>([]);
  const [fullScreen, setFullScreen] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const clientIdRef = useRef<string | null>(null);
  const reconnectRef = useRef<number | null>(null);
  const closedRef = useRef(false);
  const activeJobIdRef = useRef<string | null>(null);

  // ---- WebSocket connect with auto-reconnect ------------------------------
  const connect = useCallback(() => {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      // Re-subscribe with stored clientId after reconnect
      if (clientIdRef.current) {
        ws.send(
          JSON.stringify({ type: "subscribe", clientId: clientIdRef.current })
        );
      }
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as WSMessage;
        if (msg.type === "hello") {
          if (!clientIdRef.current) clientIdRef.current = msg.clientId;
          return;
        }
        // Filter out stray events from stale/other jobs on the same client.
        const active = activeJobIdRef.current;
        if (msg.type === "job") {
          if (active && msg.job.jobId !== active) return;
          setProgress(msg.job);
        } else if (msg.type === "page") {
          if (active && msg.jobId !== active) return;
          setPages((prev) => {
            const idx = prev.findIndex((p) => p.url === msg.page.url);
            if (idx >= 0) {
              const next = prev.slice();
              next[idx] = msg.page;
              return next;
            }
            return [...prev, msg.page];
          });
        } else if (msg.type === "log") {
          if (active && msg.jobId !== active) return;
          if (msg.level === "error") {
            toast({
              title: "Scraper",
              description: msg.message,
              variant: "destructive",
            });
          }
        }
      } catch {
        /* ignore malformed messages */
      }
    };

    ws.onclose = () => {
      if (closedRef.current) return;
      if (reconnectRef.current) window.clearTimeout(reconnectRef.current);
      reconnectRef.current = window.setTimeout(connect, 1500);
    };

    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    };
  }, [toast]);

  useEffect(() => {
    closedRef.current = false;
    connect();
    return () => {
      closedRef.current = true;
      if (reconnectRef.current) window.clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  // ---- Actions ------------------------------------------------------------

  const isRunning =
    progress.status === "starting" ||
    progress.status === "discovering" ||
    progress.status === "scraping";

  async function startScrape() {
    if (!url) {
      toast({
        title: "URL required",
        description: "Enter the documentation URL to scrape.",
      });
      return;
    }
    if (!clientIdRef.current) {
      toast({
        title: "Connecting…",
        description: "Realtime channel not ready yet — try again in a moment.",
      });
      return;
    }
    setPages([]);
    activeJobIdRef.current = null;
    setProgress({ ...idleProgress, status: "starting", currentUrl: url });
    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          options,
          clientId: clientIdRef.current,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      const data = await res.json();
      activeJobIdRef.current = data.jobId;
      setProgress((p) => ({ ...p, jobId: data.jobId }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setProgress({
        ...idleProgress,
        status: "error",
        error: msg,
      });
      toast({
        title: "Failed to start",
        description: msg,
        variant: "destructive",
      });
    }
  }

  async function cancelScrape() {
    if (!progress.jobId) return;
    try {
      await fetch(`/api/scrape/${progress.jobId}/cancel`, { method: "POST" });
    } catch {
      /* ignore */
    }
  }

  async function retryFailed() {
    if (!progress.jobId) return;
    await fetch(`/api/scrape/${progress.jobId}/retry-failed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls: [] }),
    });
  }

  async function retryOne(failedUrl: string) {
    if (!progress.jobId) return;
    await fetch(`/api/scrape/${progress.jobId}/retry-failed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls: [failedUrl] }),
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isRunning) cancelScrape();
    else startScrape();
  }

  // ---- Derived ------------------------------------------------------------

  const docTitle = useMemo(() => {
    if (!url) return "Documentation";
    try {
      const u = new URL(url);
      return u.hostname.replace(/^www\./, "");
    } catch {
      return "Documentation";
    }
  }, [url]);

  function jumpToAnchor(id: string) {
    window.dispatchEvent(new CustomEvent("docuharvest:jump", { detail: id }));
  }

  function scrollToPage(idx: number) {
    jumpToAnchor(`page-${idx}`);
  }

  // ---- Render -------------------------------------------------------------

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <BookText className="h-5 w-5 text-primary" />
          <div className="font-semibold tracking-tight">DocuHarvest</div>
          <div className="text-xs text-muted-foreground hidden sm:block">
            Scrape · compile · export documentation
          </div>
          <div className="flex-1" />
          <kbd className="hidden md:inline-flex items-center gap-1 rounded border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            <CmdIcon className="h-3 w-3" /> K
          </kbd>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            data-testid="toggle-theme"
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-4 flex flex-col gap-4 min-h-0">
        <Card className="p-4 space-y-3">
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
            <Input
              type="url"
              required
              placeholder="https://example.com/docs"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={isRunning}
              className="flex-1"
              data-testid="url-input"
            />
            <div className="flex gap-2">
              <SettingsDrawer
                options={options}
                onChange={setOptions}
                disabled={isRunning}
              />
              {isRunning ? (
                <Button
                  type="submit"
                  variant="destructive"
                  data-testid="cancel-button"
                >
                  <Square className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
              ) : (
                <Button type="submit" data-testid="start-button">
                  <Play className="h-4 w-4 mr-2" />
                  Scrape
                </Button>
              )}
            </div>
          </form>

          <ProgressBar
            status={progress.status}
            pagesScraped={progress.pagesScraped}
            pagesFailed={progress.pagesFailed}
            pagesQueued={progress.pagesQueued}
            currentUrl={progress.currentUrl}
            maxPages={options.maxPages}
            error={progress.error}
          />

          <div className="flex items-center gap-2">
            <PageStatusList
              pages={pages}
              onRetryFailed={retryFailed}
              onRetryOne={retryOne}
              busy={isRunning}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={!pages.some((p) => !p.ok) || isRunning}
              onClick={retryFailed}
              data-testid="retry-failed-quick"
            >
              Retry failed
            </Button>
            <div className="flex-1" />
            <ExportMenu
              title={docTitle}
              baseUrl={url}
              pages={pages}
              disabled={isRunning}
            />
          </div>
        </Card>

        <div className="flex-1 min-h-[28rem]">
          <PreviewPane
            pages={pages}
            title={docTitle}
            baseUrl={url}
            fullScreen={fullScreen}
            onToggleFullScreen={() => setFullScreen((v) => !v)}
          />
        </div>
      </main>

      <CommandSearch
        pages={pages}
        onJump={jumpToAnchor}
        onScrollToPage={scrollToPage}
      />
    </div>
  );
}
