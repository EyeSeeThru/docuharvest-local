import { marked, Renderer, type Tokens, type Token } from "marked";

function tokenText(t: Token): string {
  if ("text" in t && typeof (t as { text?: unknown }).text === "string") {
    return (t as { text: string }).text;
  }
  return "";
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/<[^>]+>/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

export interface RenderResult {
  html: string;
  headings: { id: string; text: string; level: number }[];
}

/**
 * Render markdown to HTML with stable heading anchors and
 * a parallel list of headings in document order.
 */
export function renderMarkdown(md: string): RenderResult {
  const headings: RenderResult["headings"] = [];
  const seen = new Map<string, number>();

  const renderer = new Renderer();
  renderer.heading = function (
    this: Renderer,
    token: Tokens.Heading,
  ): string {
    const depth = token.depth;
    const text = token.tokens.map(tokenText).join("") || "";
    const base = slugify(text) || "section";
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    const id = n === 0 ? base : `${base}-${n}`;
    headings.push({ id, text, level: depth });
    const inner = this.parser.parseInline(token.tokens);
    return `<h${depth} id="${id}" data-heading-id="${id}">${inner}<a href="#${id}" class="section-anchor" aria-label="Anchor">#</a></h${depth}>`;
  };

  marked.use({ renderer });

  const html = marked.parse(md, { gfm: true, breaks: false, async: false }) as string;
  return { html, headings };
}
