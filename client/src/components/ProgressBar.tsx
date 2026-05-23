import { Progress } from "@/components/ui/progress";
import { Loader2, CheckCircle2, XCircle, AlertTriangle, Compass, Square } from "lucide-react";
import type { JobStatus } from "@/lib/types";

interface Props {
  status: JobStatus;
  pagesScraped: number;
  pagesFailed: number;
  pagesQueued: number;
  maxPages: number;
  currentUrl: string;
  error?: string;
}

const statusLabel: Record<JobStatus, string> = {
  idle: "Idle",
  starting: "Starting…",
  discovering: "Discovering URLs…",
  scraping: "Scraping…",
  completed: "Completed",
  cancelled: "Cancelled",
  error: "Error",
};

export default function ProgressBar({
  status,
  pagesScraped,
  pagesFailed,
  pagesQueued,
  maxPages,
  currentUrl,
  error,
}: Props) {
  const total = Math.max(1, pagesScraped + pagesQueued);
  const pct =
    status === "completed"
      ? 100
      : Math.min(99, Math.round((pagesScraped / Math.max(1, Math.min(total, maxPages))) * 100));

  const Icon =
    status === "completed"
      ? CheckCircle2
      : status === "error"
        ? XCircle
        : status === "cancelled"
          ? Square
          : status === "discovering"
            ? Compass
            : status === "scraping" || status === "starting"
              ? Loader2
              : AlertTriangle;

  const spinning = status === "scraping" || status === "starting" || status === "discovering";

  return (
    <div className="space-y-2" data-testid="progress-bar">
      <div className="flex items-center gap-2 text-sm">
        <Icon className={`h-4 w-4 ${spinning ? "animate-spin" : ""}`} />
        <span className="font-medium">{statusLabel[status]}</span>
        <span className="text-muted-foreground">
          {pagesScraped} scraped
          {pagesFailed ? ` · ${pagesFailed} failed` : ""}
          {pagesQueued ? ` · ${pagesQueued} queued` : ""}
        </span>
      </div>
      <Progress value={pct} className="h-2" />
      {currentUrl && status !== "completed" && status !== "cancelled" && (
        <div
          className="truncate text-xs text-muted-foreground"
          title={currentUrl}
          data-testid="current-url"
        >
          {currentUrl}
        </div>
      )}
      {error && (
        <div className="text-xs text-destructive" data-testid="progress-error">
          {error}
        </div>
      )}
    </div>
  );
}
