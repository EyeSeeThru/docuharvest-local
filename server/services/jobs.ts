import { randomUUID } from "crypto";
import type {
  JobProgress,
  ScrapeOptions,
  ScrapedPage,
  WSMessage,
} from "../../client/src/lib/types";
import { sendToClient } from "./websocket";

export interface Job {
  id: string;
  clientId: string;
  baseUrl: string;
  options: ScrapeOptions;
  controller: AbortController;
  progress: JobProgress;
  pages: ScrapedPage[];
  cancelled: boolean;
  /** True while a scraping/retry routine is actively mutating this job. */
  running: boolean;
}

const jobs = new Map<string, Job>();

export function createJob(
  clientId: string,
  baseUrl: string,
  options: ScrapeOptions
): Job {
  const id = randomUUID();
  const job: Job = {
    id,
    clientId,
    baseUrl,
    options,
    controller: new AbortController(),
    cancelled: false,
    running: false,
    pages: [],
    progress: {
      jobId: id,
      status: "starting",
      pagesScraped: 0,
      pagesFailed: 0,
      pagesQueued: 0,
      currentUrl: baseUrl,
      startedAt: Date.now(),
    },
  };
  jobs.set(id, job);
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function cancelJob(id: string): boolean {
  const job = jobs.get(id);
  if (!job) return false;
  if (
    job.progress.status === "completed" ||
    job.progress.status === "cancelled" ||
    job.progress.status === "error"
  )
    return false;
  job.cancelled = true;
  job.controller.abort();
  return true;
}

export function emit(job: Job, msg: WSMessage) {
  sendToClient(job.clientId, msg);
}

export function updateJobProgress(job: Job, patch: Partial<JobProgress>) {
  job.progress = { ...job.progress, ...patch };
  emit(job, { type: "job", job: job.progress });
}

// Cleanup finished jobs after a while to avoid memory bloat
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of Array.from(jobs.entries())) {
    if (
      job.progress.finishedAt &&
      now - job.progress.finishedAt > 30 * 60_000
    ) {
      jobs.delete(id);
    }
  }
}, 5 * 60_000).unref?.();
