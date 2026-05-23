# DocuHarvest

A session-only, full-stack documentation scraper and compiler. Feed it a documentation URL, and it crawls the site while streaming a live hierarchical preview to your browser — then exports the result as Markdown, HTML, PDF, JSON, Zip, or `llms.txt`.

---

## Features

- **Live hierarchical preview** — Watch pages arrive in real-time as the crawler discovers them
- **Configurable crawl options** — Max pages, depth, concurrency, include/exclude patterns, sitemap/robots.txt parsing
- **Optional JavaScript rendering** — Headless Chromium via Puppeteer for sites that require client-side rendering
- **Multiple export formats** — Markdown, styled HTML, PDF, JSON, multi-file Zip, `llms.txt`
- **Per-page status tracking** — See every URL touched, retry failed pages individually
- **Command palette** — `Cmd+K` global search over all scraped page content
- **Dark mode** — Theme toggle persisted to localStorage

---

## Quick Start

```bash
git clone https://github.com/EyeSeeThru/docuharvest-local.git
cd docuharvest-local
npm install
npx puppeteer browsers install chrome   # optional, only needed for PDF export
npm run dev
```

Open `http://localhost:5000` in your browser.

---

## Access Over Tailscale

If you're on the same Tailscale network as the machine running DocuHarvest, any device connected to the tailnet can reach it at `http://<machine-tailnet-ip>:5000` — no extra configuration needed.

---

## Production Build

```bash
npm run build
PORT=5000 npm start
```

Set the `PORT` env var to use a different port.

---

## No Environment Variables Required

DocuHarvest is fully self-contained:

- No database (all state is in-memory for the session)
- No API keys or secrets
- No `.env` file needed

---

## License

MIT License — see [LICENSE](./LICENSE)

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| UI | Radix UI + shadcn/ui + Tailwind CSS |
| Routing | Wouter |
| Backend | Express + WebSocket (`ws`) |
| Scraping | Cheerio + Turndown + Marked |
| PDF export | html-pdf-node (Puppeteer) |
| Zip export | JSZip |