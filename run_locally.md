# Running DocuHarvest Locally

## Prerequisites

| Item | Version / Notes |
|---|---|
| **Node.js** | 20.x or newer |
| **npm** | Comes with Node.js |
| **Chromium** | Required by Puppeteer for PDF export and optional JS rendering. Run `npx puppeteer browsers install chrome` to install it. |

---

## Install Steps

```bash
# 1. Clone the project and cd into it
git clone https://github.com/EyeSeeThru/docuharvest-local.git
cd docuharvest-local

# 2. Install dependencies
npm install

# 3. Install the Chromium binary that Puppeteer uses
npx puppeteer browsers install chrome
```

---

## Run It (Local)

```bash
npm run dev
```

This single command starts everything:

- **Backend:** Express server on `http://localhost:5000`
- **Frontend:** Vite dev server (served through Express middleware, so the frontend loads at the same port)

Open `http://localhost:5000` in your browser.

---

## Run It (Production Build)

```bash
npm run build    # Vite builds the client + esbuild bundles the server
npm start        # Runs the production bundle on port 5000
```

To use a different port, set the `PORT` environment variable:
```bash
PORT=8080 npm start
```

---

## Access Over Tailscale

If you're on the same Tailscale network as the machine running DocuHarvest, you can reach it via the Tailscale IP address directly (e.g. `http://100.x.x.x:5000/`), or set up a stable HTTPS URL with:

```bash
tailscale serve https+insecure://localhost:5000
```

This makes DocuHarvest available at `https://<machine-name>.tailnet.ts.net/` to all devices on your tailnet. Run `tailscale serve --https=443 off` to disable it.

---

## No Env Vars Needed

The app is **fully self-contained**:

- No database to configure (all state is in-memory)
- No API keys or secrets
- No `.env` file required

---

## Potential Gotchas

| Issue | Fix |
|---|---|
| **Puppeteer can't find Chrome** | Run `npx puppeteer browsers install chrome` |
| **Missing Linux shared libs for Chrome** | On Debian/Ubuntu: `sudo apt install libgobject-2.0-0 libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 libgbm1 libasound2 libpango-1.0-0 libcairo2` |
| **Port 5000 already in use** | Set `PORT` env var: `PORT=5001 npm start` |
| **TypeScript errors during dev** | The project uses `tsx` (not `ts-node`) — this is handled automatically by `npm run dev` |

---

## Stack Summary

| Layer | Technology |
|---|---|
| Frontend framework | React 18 + TypeScript |
| Bundler | Vite |
| Router | Wouter |
| UI components | Radix UI + shadcn/ui + Tailwind CSS |
| State / data fetching | TanStack Query (used lightly) |
| Backend | Express (Node.js, ES modules) |
| Dev runner | `tsx` |
| Realtime | WebSocket (`ws` library) |
| HTML parsing | Cheerio |
| Markdown | Marked + Turndown |
| Zip export | JSZip |
| PDF export | html-pdf-node (wraps Puppeteer) |
| Optional headless rendering | Puppeteer |