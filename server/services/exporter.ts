import JSZip from "jszip";
import { renderMarkdownToHtml } from "./compiler";

export interface ExportPage {
  url: string;
  title: string;
  markdown: string;
}

export interface ExportInput {
  title: string;
  baseUrl: string;
  pages: ExportPage[];
}

function safeFile(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/https?:\/\//, "")
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "page"
  );
}

export function combineMarkdown(input: ExportInput): string {
  const lines: string[] = [];
  lines.push(`# ${input.title}`);
  lines.push("");
  lines.push(`> Source: ${input.baseUrl}`);
  lines.push(`> Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("## Table of contents");
  lines.push("");
  for (const p of input.pages) {
    const anchor = safeFile(p.title || p.url);
    lines.push(`- [${p.title || p.url}](#${anchor})`);
  }
  lines.push("\n---\n");
  for (const p of input.pages) {
    const anchor = safeFile(p.title || p.url);
    lines.push(`<a id="${anchor}"></a>`);
    lines.push(`## ${p.title || p.url}`);
    lines.push("");
    lines.push(`_Source: ${p.url}_`);
    lines.push("");
    lines.push(p.markdown.trim());
    lines.push("\n---\n");
  }
  return lines.join("\n");
}

export function buildHtml(input: ExportInput): string {
  const md = combineMarkdown(input);
  const body = renderMarkdownToHtml(md);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(input.title)}</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; max-width: 860px; margin: 2rem auto; padding: 0 1.25rem; line-height: 1.65; color: #1a1a1a; background: #fff; }
  @media (prefers-color-scheme: dark) { body { background: #0b0b0c; color: #e6e6e6; } a { color: #79b8ff; } }
  h1,h2,h3,h4 { line-height: 1.25; }
  pre { background: #0e1116; color: #e6edf3; padding: 1rem; border-radius: .5rem; overflow:auto; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  hr { border: none; border-top: 1px solid #ddd; margin: 2rem 0; }
  blockquote { border-left: 3px solid #888; padding-left: 1rem; color: #666; }
  img { max-width: 100%; }
  table { border-collapse: collapse; }
  th, td { border: 1px solid #ddd; padding: .35rem .6rem; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c]!)
  );
}

export async function buildZip(input: ExportInput): Promise<Buffer> {
  const zip = new JSZip();
  const root = zip.folder(safeFile(input.title) || "docs")!;
  const used = new Map<string, number>();
  const indexLines = [`# ${input.title}`, "", `> ${input.baseUrl}`, ""];
  for (const p of input.pages) {
    let name = safeFile(p.title || p.url);
    const n = used.get(name) || 0;
    used.set(name, n + 1);
    if (n > 0) name = `${name}-${n}`;
    const fileName = `${name}.md`;
    const content = `# ${p.title || p.url}\n\n_Source: ${p.url}_\n\n${p.markdown.trim()}\n`;
    root.file(fileName, content);
    indexLines.push(`- [${p.title || p.url}](./${fileName})`);
  }
  root.file("index.md", indexLines.join("\n"));
  return root.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

export function buildJson(input: ExportInput): string {
  return JSON.stringify(
    {
      title: input.title,
      baseUrl: input.baseUrl,
      generatedAt: new Date().toISOString(),
      pages: input.pages,
    },
    null,
    2
  );
}

export function buildLlmsTxt(input: ExportInput): string {
  const lines: string[] = [];
  lines.push(`# ${input.title}`);
  lines.push("");
  lines.push(`> Documentation compiled from ${input.baseUrl}`);
  lines.push("");
  lines.push("## Pages");
  lines.push("");
  for (const p of input.pages) {
    lines.push(`- [${p.title || p.url}](${p.url})`);
  }
  return lines.join("\n");
}

interface HtmlPdfNode {
  generatePdf(
    file: { content?: string; url?: string },
    options: Record<string, unknown>,
  ): Promise<Buffer>;
}

export async function buildPdf(input: ExportInput): Promise<Buffer> {
  const html = buildHtml(input);
  // Use html-pdf-node (which wraps puppeteer) for PDF generation.
  const mod: unknown = await import("html-pdf-node");
  const htmlPdf = (
    (mod as { default?: HtmlPdfNode }).default ?? (mod as HtmlPdfNode)
  );
  // html-pdf-node hardcodes puppeteer.launch({args}) and ignores
  // executablePath in its options, and the version it bundles can't
  // find its bundled Chromium libs in our Nix env. Old puppeteer
  // respects the PUPPETEER_EXECUTABLE_PATH env var, so point it at
  // the working chrome from our top-level puppeteer install.
  if (!process.env.PUPPETEER_EXECUTABLE_PATH) {
    try {
      const pup = (await import("puppeteer")).default;
      process.env.PUPPETEER_EXECUTABLE_PATH = pup.executablePath();
    } catch {
      /* fall back to bundled */
    }
  }
  const buf = await htmlPdf.generatePdf(
    { content: html },
    {
      format: "A4",
      printBackground: true,
      margin: { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" },
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    },
  );
  return Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
}
