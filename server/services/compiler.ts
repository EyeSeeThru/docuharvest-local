import { load } from "cheerio";
import { marked } from "marked";
import TurndownService from "turndown";
import type { Heading } from "../../client/src/lib/types";

const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  fence: "```",
  emDelimiter: "_",
  strongDelimiter: "**",
  blankReplacement: () => "",
});

// Preserve fenced code blocks language hints when present
turndown.addRule("fencedCodeBlock", {
  filter: (node: HTMLElement): boolean =>
    node.nodeName === "PRE" && node.firstChild?.nodeName === "CODE",
  replacement: (_content: string, node): string => {
    const code = (node as HTMLElement).firstChild as HTMLElement | null;
    const className = code?.getAttribute("class") ?? "";
    const lang = className.match(/language-([\w+-]+)/)?.[1] || "";
    const text = code?.textContent ?? "";
    return `\n\n\`\`\`${lang}\n${text.replace(/\n$/, "")}\n\`\`\`\n\n`;
  },
});

// Strip noisy attributes from links/images
turndown.addRule("cleanLinks", {
  filter: "a",
  replacement: (content: string, node): string => {
    const href = (node as HTMLElement).getAttribute("href") ?? "";
    if (!href || href.startsWith("#")) return content;
    return `[${content}](${href})`;
  },
});

const NOISE_SELECTORS = [
  "script",
  "style",
  "nav",
  "footer",
  "iframe",
  "header",
  "noscript",
  "svg.icon",
  ".navigation",
  ".sidebar",
  ".menu",
  ".ads",
  ".comments",
  "#comments",
  ".related",
  ".social-share",
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  ".nav",
  ".footer",
  ".header",
  ".cookie-banner",
  ".newsletter-signup",
  ".advertisement",
  ".popup",
  ".modal",
  ".dialog",
  ".breadcrumb",
  ".breadcrumbs",
  ".edit-page",
  ".edit-this-page",
  ".pagination",
  ".prev-next",
  ".table-of-contents",
  ".toc",
  ".on-this-page",
  '[style*="display: none"]',
  '[style*="display:none"]',
  "[hidden]",
  '[aria-hidden="true"]',
];

const MAIN_SELECTORS = [
  "main article",
  "article",
  "main",
  '[role="main"]',
  ".markdown-body",
  ".content",
  ".doc-content",
  ".docs-content",
  ".documentation",
  ".prose",
  "#content",
  "#main",
];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

export function extractHeadings(markdown: string): Heading[] {
  const headings: Heading[] = [];
  const tokens = marked.lexer(markdown);
  const seen = new Map<string, number>();
  for (const t of tokens) {
    if (t.type === "heading") {
      const base = slugify(t.text) || "section";
      const n = seen.get(base) || 0;
      seen.set(base, n + 1);
      const id = n === 0 ? base : `${base}-${n}`;
      headings.push({ id, text: t.text, level: t.depth });
    }
  }
  return headings;
}

export interface ConvertedPage {
  title: string;
  markdown: string;
  headings: Heading[];
}

export function convertHtmlToMarkdown(
  html: string,
  fallbackTitle: string
): ConvertedPage {
  const $ = load(html);

  // Strip noise
  for (const sel of NOISE_SELECTORS) {
    try {
      $(sel).remove();
    } catch {
      /* ignore bad selectors */
    }
  }
  $("p:empty, div:empty, span:empty").remove();

  // Pick the best content root
  let root = null as ReturnType<typeof $> | null;
  for (const sel of MAIN_SELECTORS) {
    const found = $(sel).first();
    if (found.length && (found.text().trim().length > 100)) {
      root = found;
      break;
    }
  }
  if (!root) root = $("body");

  const title =
    $("h1").first().text().trim() ||
    $("title").text().trim() ||
    fallbackTitle;

  // Drop the page-level h1 if it duplicates the title we'll add
  const innerHtml = root.html() || "";

  let md = "";
  try {
    md = turndown.turndown(innerHtml).trim();
  } catch (e) {
    md = "";
  }

  // Collapse 3+ blank lines
  md = md.replace(/\n{3,}/g, "\n\n");

  const headings = extractHeadings(md);
  return { title, markdown: md, headings };
}

export function renderMarkdownToHtml(markdown: string): string {
  return marked(markdown, { gfm: true, breaks: false, async: false }) as string;
}
