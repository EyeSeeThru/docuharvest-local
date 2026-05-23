import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer } from "ws";
import { setupWebSocket } from "./services/websocket";
import { runScrape, retryFailed } from "./services/scraper";
import {
  cancelJob,
  createJob,
  getJob,
  updateJobProgress,
  emit,
} from "./services/jobs";
import { DEFAULT_OPTIONS, type ScrapeOptions } from "../client/src/lib/types";
import { assertSafeUrl } from "./services/ssrf";
import {
  buildHtml,
  buildJson,
  buildLlmsTxt,
  buildPdf,
  buildZip,
  combineMarkdown,
  type ExportInput,
} from "./services/exporter";

export function registerRoutes(app: Express): Server {
  const httpServer = createServer(app);

  const wss = new WebSocketServer({ noServer: true });
  setupWebSocket(wss);

  httpServer.on("upgrade", (request, socket, head) => {
    if (request.headers["sec-websocket-protocol"]?.includes("vite-hmr")) {
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  // Start a scrape job. Returns immediately with jobId; results stream over WS.
  app.post("/api/scrape", async (req, res) => {
    const { url, options, clientId } = req.body || {};
    if (!url || typeof url !== "string") {
      return res.status(400).json({ message: "URL is required" });
    }
    if (!clientId || typeof clientId !== "string") {
      return res
        .status(400)
        .json({ message: "clientId is required (open a websocket first)" });
    }
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return res.status(400).json({ message: "Invalid URL" });
    }
    try {
      await assertSafeUrl(parsed.toString());
    } catch (e) {
      return res
        .status(400)
        .json({ message: e instanceof Error ? e.message : "URL is not allowed" });
    }

    const opts: ScrapeOptions = { ...DEFAULT_OPTIONS, ...(options || {}) };
    opts.maxPages = Math.min(Math.max(1, opts.maxPages | 0), 500);
    opts.maxDepth = Math.min(Math.max(0, opts.maxDepth | 0), 8);
    opts.concurrency = Math.min(Math.max(1, opts.concurrency | 0), 10);

    const job = createJob(clientId, parsed.toString(), opts);
    res.json({ jobId: job.id });

    // Run async — failures captured into job state
    runScrape(job).catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      updateJobProgress(job, {
        status: "error",
        error: msg,
        finishedAt: Date.now(),
      });
      emit(job, {
        type: "log",
        jobId: job.id,
        level: "error",
        message: msg,
      });
    });
  });

  app.post("/api/scrape/:jobId/cancel", (req, res) => {
    const ok = cancelJob(req.params.jobId);
    if (!ok) return res.status(404).json({ message: "Job not found or finished" });
    res.json({ ok: true });
  });

  app.post("/api/scrape/:jobId/retry-failed", (req, res) => {
    const job = getJob(req.params.jobId);
    if (!job) return res.status(404).json({ message: "Job not found" });
    if (job.running) {
      return res
        .status(409)
        .json({ message: "Job is currently running; cancel it first." });
    }
    const urls: string[] = Array.isArray(req.body?.urls) ? req.body.urls : [];
    res.json({ ok: true });
    retryFailed(job, urls).catch((e: unknown) => {
      updateJobProgress(job, {
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      });
    });
  });

  // ----- Exports -----------------------------------------------------------

  function readExportInput(req: Request, res: Response): ExportInput | null {
    const { title, baseUrl, pages } = req.body || {};
    if (!Array.isArray(pages) || pages.length === 0) {
      res.status(400).json({ message: "No pages provided" });
      return null;
    }
    return {
      title: typeof title === "string" && title ? title : "Documentation",
      baseUrl: typeof baseUrl === "string" ? baseUrl : "",
      pages: (pages as Array<Record<string, unknown>>)
        .filter(
          (p) =>
            p &&
            typeof p.markdown === "string" &&
            (p.markdown as string).length > 0 &&
            !p.skipped,
        )
        .map((p) => ({
          url: String(p.url || ""),
          title: String(p.title || p.url || "Untitled"),
          markdown: String(p.markdown || ""),
        })),
    };
  }

  function fileName(base: string, ext: string): string {
    const safe = base
      .toLowerCase()
      .replace(/https?:\/\//, "")
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "documentation";
    return `${safe}.${ext}`;
  }

  app.post("/api/export/markdown", (req, res) => {
    const input = readExportInput(req, res);
    if (!input) return;
    const md = combineMarkdown(input);
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fileName(input.title, "md")}"`
    );
    res.send(md);
  });

  app.post("/api/export/html", (req, res) => {
    const input = readExportInput(req, res);
    if (!input) return;
    const html = buildHtml(input);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fileName(input.title, "html")}"`
    );
    res.send(html);
  });

  app.post("/api/export/json", (req, res) => {
    const input = readExportInput(req, res);
    if (!input) return;
    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fileName(input.title, "json")}"`
    );
    res.send(buildJson(input));
  });

  app.post("/api/export/llms", (req, res) => {
    const input = readExportInput(req, res);
    if (!input) return;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="llms.txt"`
    );
    res.send(buildLlmsTxt(input));
  });

  app.post("/api/export/zip", async (req, res) => {
    const input = readExportInput(req, res);
    if (!input) return;
    try {
      const buf = await buildZip(input);
      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${fileName(input.title, "zip")}"`
      );
      res.send(buf);
    } catch (e) {
      res.status(500).json({
        message: e instanceof Error ? e.message : "Zip export failed",
      });
    }
  });

  app.post("/api/export/pdf", async (req, res) => {
    const input = readExportInput(req, res);
    if (!input) return;
    try {
      const buf = await buildPdf(input);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${fileName(input.title, "pdf")}"`
      );
      res.send(buf);
    } catch (e) {
      res.status(500).json({
        message:
          "PDF export failed. The headless browser may be unavailable. " +
          (e instanceof Error ? e.message : ""),
      });
    }
  });

  return httpServer;
}
