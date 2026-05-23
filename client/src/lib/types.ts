export type JobStatus =
  | "idle"
  | "starting"
  | "discovering"
  | "scraping"
  | "completed"
  | "cancelled"
  | "error";

export interface Heading {
  id: string;
  text: string;
  level: number;
}

export interface ScrapedPage {
  url: string;
  title: string;
  markdown: string;
  headings: Heading[];
  ok: boolean;
  error?: string;
  skipped?: boolean;
  skipReason?: string;
  depth: number;
  contentHash?: string;
  bytes: number;
}

export interface JobProgress {
  jobId: string;
  status: JobStatus;
  pagesScraped: number;
  pagesFailed: number;
  pagesQueued: number;
  currentUrl: string;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
}

export interface ScrapeOptions {
  maxPages: number;
  maxDepth: number;
  concurrency: number;
  includePatterns: string[];
  excludePatterns: string[];
  useSitemap: boolean;
  jsRender: boolean;
  respectRobots: boolean;
  sameOriginOnly: boolean;
}

export const DEFAULT_OPTIONS: ScrapeOptions = {
  maxPages: 60,
  maxDepth: 4,
  concurrency: 4,
  includePatterns: [],
  excludePatterns: [],
  useSitemap: true,
  jsRender: false,
  respectRobots: true,
  sameOriginOnly: true,
};

export type WSMessage =
  | { type: "hello"; clientId: string }
  | { type: "subscribe"; clientId: string }
  | { type: "job"; job: JobProgress }
  | { type: "page"; jobId: string; page: ScrapedPage }
  | { type: "log"; jobId: string; level: "info" | "warn" | "error"; message: string };
