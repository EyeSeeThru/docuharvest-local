import { load } from "cheerio";
import {
  emit,
  updateJobProgress,
  type Job,
} from "./jobs";
import { convertHtmlToMarkdown } from "./compiler";
import type { ScrapedPage } from "../../client/src/lib/types";
import { createHash } from "crypto";
import { safeFetch, assertSafeUrl } from "./ssrf";

const FETCH_TIMEOUT_MS = 20000;
const RETRY_COUNT = 2;
const RETRY_DELAY_MS = 600;

// Use a real browser UA — many CDNs (CloudFront, Cloudflare) reject
// strings containing "bot/crawler" with a 403.
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function hash(s: string) {
  return createHash("sha1").update(s).digest("hex");
}

// --- Glob helpers ----------------------------------------------------------

function globToRegex(glob: string): RegExp {
  // Support **, *, ? — match against full URL string
  let g = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  g = g.replace(/\*\*/g, "::DSTAR::");
  g = g.replace(/\*/g, "[^/]*");
  g = g.replace(/::DSTAR::/g, ".*");
  g = g.replace(/\?/g, ".");
  return new RegExp("^" + g + "$", "i");
}

function matchesAny(url: string, patterns: string[]): boolean {
  return patterns.some((p) => {
    try {
      return globToRegex(p).test(url);
    } catch {
      return false;
    }
  });
}

// --- Robots.txt ------------------------------------------------------------

interface RobotsRules {
  disallow: string[];
  allow: string[];
}

async function loadRobots(origin: string): Promise<RobotsRules> {
  const rules: RobotsRules = { disallow: [], allow: [] };
  try {
    const res = await fetchWithTimeout(`${origin}/robots.txt`, 5000);
    if (!res.ok) return rules;
    const text = await res.text();
    let applies = false;
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.replace(/#.*$/, "").trim();
      if (!line) continue;
      const [k, ...rest] = line.split(":");
      const key = k.toLowerCase().trim();
      const value = rest.join(":").trim();
      if (key === "user-agent") {
        applies = value === "*" || /docuharvest/i.test(value);
      } else if (applies && key === "disallow" && value) {
        rules.disallow.push(value);
      } else if (applies && key === "allow" && value) {
        rules.allow.push(value);
      }
    }
  } catch {
    /* ignore */
  }
  return rules;
}

function robotsAllows(pathname: string, rules: RobotsRules): boolean {
  // Longest matching rule wins (allow vs disallow)
  let bestLen = -1;
  let bestAllowed = true;
  for (const r of rules.allow) {
    if (pathname.startsWith(r) && r.length > bestLen) {
      bestLen = r.length;
      bestAllowed = true;
    }
  }
  for (const r of rules.disallow) {
    if (pathname.startsWith(r) && r.length > bestLen) {
      bestLen = r.length;
      bestAllowed = false;
    }
  }
  return bestAllowed;
}

// --- Sitemap ---------------------------------------------------------------

async function loadSitemap(
  origin: string,
  baseUrl: string,
  signal: AbortSignal
): Promise<string[]> {
  const urls: string[] = [];
  const seen = new Set<string>();
  const queue = [`${origin}/sitemap.xml`];

  while (queue.length && urls.length < 5000) {
    const sm = queue.shift()!;
    if (seen.has(sm)) continue;
    seen.add(sm);
    try {
      const res = await fetchWithTimeout(sm, 8000, signal);
      if (!res.ok) continue;
      const xml = await res.text();
      const $ = load(xml, { xmlMode: true });
      $("sitemap > loc").each((_, el) => {
        const u = $(el).text().trim();
        // Only follow nested sitemap indexes on the same origin to avoid
        // attacker-controlled SSRF fan-out.
        if (u && u.startsWith(origin)) queue.push(u);
      });
      $("url > loc").each((_, el) => {
        const u = $(el).text().trim();
        if (u && u.startsWith(baseUrl)) urls.push(u);
      });
    } catch {
      /* ignore */
    }
  }
  return urls;
}

// --- Fetch helpers ---------------------------------------------------------

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<Response> {
  return safeFetch(url, {
    timeoutMs,
    signal,
    headers: {
      "user-agent": DEFAULT_USER_AGENT,
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
    },
  });
}

async function fetchHtml(
  url: string,
  signal: AbortSignal
): Promise<{ html: string; finalUrl: string }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRY_COUNT; attempt++) {
    try {
      const res = await fetchWithTimeout(url, FETCH_TIMEOUT_MS, signal);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ct = res.headers.get("content-type") || "";
      if (!/html|xml|text/i.test(ct))
        throw new Error(`unsupported content-type: ${ct}`);
      const html = await res.text();
      return { html, finalUrl: res.url || url };
    } catch (e) {
      lastErr = e;
      if (signal.aborted) throw e;
      await sleep(RETRY_DELAY_MS * (attempt + 1));
    }
  }
  throw lastErr || new Error("fetch failed");
}

// Lazy puppeteer (only loaded if user enables JS rendering)
import type { Browser, HTTPRequest } from "puppeteer";
let _browserPromise: Promise<Browser> | null = null;
async function getBrowser(): Promise<Browser> {
  if (!_browserPromise) {
    _browserPromise = (async () => {
      const puppeteer = (await import("puppeteer")).default;
      return puppeteer.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
        ],
      });
    })().catch((e) => {
      _browserPromise = null;
      throw e;
    });
  }
  return _browserPromise;
}

async function fetchHtmlRendered(
  url: string,
  signal: AbortSignal
): Promise<{ html: string; finalUrl: string }> {
  // SSRF check before launching the browser
  await assertSafeUrl(url);
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setUserAgent(DEFAULT_USER_AGENT);
    // Block requests to internal targets and re-validate redirects.
    await page.setRequestInterception(true);
    page.on("request", async (req: HTTPRequest) => {
      try {
        await assertSafeUrl(req.url());
        await req.continue();
      } catch {
        await req.abort();
      }
    });
    const onAbort = () => page.close().catch(() => {});
    signal.addEventListener("abort", onAbort);
    await page.goto(url, { waitUntil: "networkidle2", timeout: FETCH_TIMEOUT_MS });
    const html = await page.content();
    const finalUrl = page.url();
    signal.removeEventListener("abort", onAbort);
    return { html, finalUrl };
  } finally {
    await page.close().catch(() => {});
  }
}

export async function shutdownBrowser() {
  if (_browserPromise) {
    try {
      const b = await _browserPromise;
      await b.close();
    } catch {
      /* ignore */
    }
    _browserPromise = null;
  }
}

// --- URL helpers -----------------------------------------------------------

function normalizeUrl(href: string, base: string): string | null {
  try {
    const u = new URL(href, base);
    u.hash = "";
    // Strip common tracking params
    [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "ref",
      "ref_src",
    ].forEach((p) => u.searchParams.delete(p));
    // Drop trailing slash for non-root paths
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.toString();
  } catch {
    return null;
  }
}

const ASSET_RE =
  /\.(jpg|jpeg|png|gif|svg|webp|ico|css|js|mjs|json|xml|pdf|zip|gz|tar|mp4|mp3|wav|woff2?|ttf|eot)(\?|$)/i;

// --- Main scrape entry -----------------------------------------------------

export async function runScrape(job: Job): Promise<void> {
  if (job.running) throw new Error("job is already running");
  job.running = true;
  try {
    return await runScrapeInner(job);
  } finally {
    job.running = false;
  }
}

async function runScrapeInner(job: Job): Promise<void> {
  const { options } = job;
  const baseUrl = job.baseUrl.replace(/\/$/, "") + "/";
  const baseUrlObj = new URL(baseUrl);
  const origin = baseUrlObj.origin;
  const basePath = baseUrlObj.pathname.replace(/\/$/, "");

  emit(job, {
    type: "log",
    jobId: job.id,
    level: "info",
    message: `Starting crawl of ${baseUrl}`,
  });

  updateJobProgress(job, { status: "discovering", currentUrl: baseUrl });

  const robots = options.respectRobots
    ? await loadRobots(origin)
    : { disallow: [], allow: [] };

  const visited = new Set<string>();
  const queued = new Set<string>();
  const seenContentHashes = new Set<string>();
  const queue: { url: string; depth: number }[] = [];

  function enqueue(url: string, depth: number) {
    if (depth > options.maxDepth) return;
    if (queued.has(url) || visited.has(url)) return;

    if (options.sameOriginOnly) {
      // When same-origin is enforced we still allow sibling sections of
      // the same host (e.g. starting at /docs but linking to /guides) so
      // a deep entry URL doesn't choke the crawl.
      if (!url.startsWith(origin)) return;
    }
    // Otherwise no host restriction at all.
    if (ASSET_RE.test(url)) return;

    if (
      options.includePatterns.length &&
      !matchesAny(url, options.includePatterns)
    )
      return;
    if (
      options.excludePatterns.length &&
      matchesAny(url, options.excludePatterns)
    )
      return;

    if (options.respectRobots) {
      try {
        const p = new URL(url).pathname;
        if (!robotsAllows(p, robots)) return;
      } catch {
        return;
      }
    }

    queued.add(url);
    queue.push({ url, depth });
  }

  enqueue(baseUrl.replace(/\/$/, "") || baseUrl, 0);

  // Sitemap pre-seeding
  if (options.useSitemap) {
    try {
      const sm = await loadSitemap(origin, baseUrl, job.controller.signal);
      for (const u of sm) {
        const n = normalizeUrl(u, baseUrl);
        if (n) enqueue(n, 0);
      }
      if (sm.length) {
        emit(job, {
          type: "log",
          jobId: job.id,
          level: "info",
          message: `Sitemap discovered ${sm.length} URLs`,
        });
      }
    } catch {
      /* ignore */
    }
  }

  updateJobProgress(job, {
    status: "scraping",
    pagesQueued: queue.length,
  });

  const inFlight = new Set<Promise<void>>();
  const concurrency = Math.max(1, Math.min(options.concurrency, 10));
  let attempted = 0;

  const runOne = async (item: { url: string; depth: number }) => {
    if (job.cancelled) return;
    if (visited.has(item.url)) return;
    visited.add(item.url);

    updateJobProgress(job, { currentUrl: item.url });

    let page: ScrapedPage = {
      url: item.url,
      title: item.url,
      markdown: "",
      headings: [],
      ok: false,
      depth: item.depth,
      bytes: 0,
    };

    try {
      const fetcher = options.jsRender ? fetchHtmlRendered : fetchHtml;
      const { html, finalUrl } = await fetcher(item.url, job.controller.signal);

      const converted = convertHtmlToMarkdown(html, item.url);

      const ch = hash(converted.markdown);
      if (converted.markdown.length < 80) {
        throw new Error("page has no extractable content");
      }
      if (seenContentHashes.has(ch)) {
        const skipped: ScrapedPage = {
          url: finalUrl || item.url,
          title: converted.title || item.url,
          markdown: "",
          headings: [],
          ok: true,
          skipped: true,
          skipReason: "duplicate content",
          depth: item.depth,
          bytes: 0,
          contentHash: ch,
        };
        job.pages.push(skipped);
        emit(job, { type: "page", jobId: job.id, page: skipped });
        updateJobProgress(job, {
          pagesQueued: queue.length + inFlight.size,
        });
        return;
      }
      seenContentHashes.add(ch);

      page = {
        url: finalUrl || item.url,
        title: converted.title,
        markdown: converted.markdown,
        headings: converted.headings,
        ok: true,
        depth: item.depth,
        contentHash: ch,
        bytes: converted.markdown.length,
      };

      // Discover links from this page (only if depth allows)
      if (item.depth < options.maxDepth) {
        const $ = load(html);
        $("a[href]").each((_, el) => {
          const href = $(el).attr("href");
          if (!href) return;
          const n = normalizeUrl(href, finalUrl || item.url);
          if (n) enqueue(n, item.depth + 1);
        });
      }

      job.pages.push(page);
      updateJobProgress(job, {
        pagesScraped: job.progress.pagesScraped + 1,
        pagesQueued: queue.length + inFlight.size,
      });
    } catch (e) {
      if (job.cancelled || job.controller.signal.aborted) return;
      page.ok = false;
      page.error = e instanceof Error ? e.message : String(e);
      job.pages.push(page);
      updateJobProgress(job, {
        pagesFailed: job.progress.pagesFailed + 1,
        pagesQueued: queue.length + inFlight.size,
      });
    }

    emit(job, { type: "page", jobId: job.id, page });
  };

  while ((queue.length || inFlight.size) && !job.cancelled) {
    while (
      queue.length &&
      inFlight.size < concurrency &&
      attempted < options.maxPages
    ) {
      const item = queue.shift()!;
      attempted += 1;
      const p = runOne(item).finally(() => inFlight.delete(p));
      inFlight.add(p);
    }
    if (!inFlight.size) break;
    await Promise.race(inFlight);
    if (attempted >= options.maxPages) {
      emit(job, {
        type: "log",
        jobId: job.id,
        level: "info",
        message: `Reached max pages (${options.maxPages}); stopping.`,
      });
      break;
    }
  }

  // Wait for any stragglers
  await Promise.allSettled(inFlight);

  if (job.cancelled) {
    updateJobProgress(job, {
      status: "cancelled",
      finishedAt: Date.now(),
      pagesQueued: 0,
    });
    return;
  }

  updateJobProgress(job, {
    status: "completed",
    finishedAt: Date.now(),
    pagesQueued: 0,
  });
}

export async function retryFailed(job: Job, urls: string[]): Promise<void> {
  if (job.running) throw new Error("job is busy; wait for it to finish");
  const status = job.progress.status;
  if (status !== "completed" && status !== "cancelled" && status !== "error") {
    throw new Error(`cannot retry while job is ${status}`);
  }
  job.running = true;
  try {
    return await retryFailedInner(job, urls);
  } finally {
    job.running = false;
  }
}

async function retryFailedInner(job: Job, urls: string[]): Promise<void> {
  const targets = urls.length
    ? urls
    : job.pages.filter((p) => !p.ok).map((p) => p.url);
  if (!targets.length) return;
  // Reset matching failed entries
  job.pages = job.pages.filter((p) => !targets.includes(p.url));
  job.progress.pagesFailed = job.pages.filter((p) => !p.ok).length;

  updateJobProgress(job, { status: "scraping" });

  for (const url of targets) {
    if (job.cancelled) break;
    updateJobProgress(job, { currentUrl: url });
    try {
      const fetcher = job.options.jsRender ? fetchHtmlRendered : fetchHtml;
      const { html, finalUrl } = await fetcher(url, job.controller.signal);
      const converted = convertHtmlToMarkdown(html, url);
      const page = {
        url: finalUrl || url,
        title: converted.title,
        markdown: converted.markdown,
        headings: converted.headings,
        ok: true,
        depth: 0,
        bytes: converted.markdown.length,
      };
      job.pages.push(page);
      updateJobProgress(job, {
        pagesScraped: job.progress.pagesScraped + 1,
      });
      emit(job, { type: "page", jobId: job.id, page });
    } catch (e) {
      const page = {
        url,
        title: url,
        markdown: "",
        headings: [],
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        depth: 0,
        bytes: 0,
      };
      job.pages.push(page);
      updateJobProgress(job, {
        pagesFailed: job.progress.pagesFailed + 1,
      });
      emit(job, { type: "page", jobId: job.id, page });
    }
  }

  updateJobProgress(job, {
    status: "completed",
    finishedAt: Date.now(),
  });
}
