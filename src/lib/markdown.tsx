import { Fragment, type ReactNode } from "react";

/**
 * Minimal, safe Markdown renderer for owner-written content (policies, blog posts).
 * Output is built from React elements only, so raw HTML in the source is shown as text and can never execute.
 * Supports: # ## ### headings, paragraphs, - / 1. lists, **bold**, *italic*, [text](https://… or /path) links.
 */

const SAFE_HREF = /^(https:\/\/|\/(?!\/)|mailto:)/i;

export function renderInline(text: string, keyPrefix = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = `${keyPrefix}-${n++}`;
    if (m[1] !== undefined) {
      out.push(SAFE_HREF.test(m[2])
        ? <a key={key} href={m[2]} className="font-semibold text-accent underline" {...(m[2].startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{m[1]}</a>
        : <Fragment key={key}>{m[1]}</Fragment>); // unsafe scheme (javascript:, data:, …): keep the text, drop the link
    } else if (m[3] !== undefined) out.push(<strong key={key}>{m[3]}</strong>);
    else out.push(<em key={key}>{m[4]}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function renderMarkdown(src: string): ReactNode[] {
  const blocks: ReactNode[] = [];
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const cls = level === 1 ? "mt-8 text-2xl font-extrabold" : level === 2 ? "mt-8 text-xl font-bold" : "mt-6 text-lg font-bold";
      const kids = renderInline(h[2], `h${k}`);
      blocks.push(level === 1 ? <h2 key={k++} className={cls}>{kids}</h2> : level === 2 ? <h2 key={k++} className={cls}>{kids}</h2> : <h3 key={k++} className={cls}>{kids}</h3>);
      i++; continue;
    }
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items: ReactNode[] = [];
      while (i < lines.length && (ordered ? /^\s*\d+\.\s+/.test(lines[i]) : /^\s*[-*]\s+/.test(lines[i]))) {
        items.push(<li key={items.length}>{renderInline(lines[i].replace(/^\s*(?:[-*]|\d+\.)\s+/, ""), `l${k}-${items.length}`)}</li>);
        i++;
      }
      blocks.push(ordered
        ? <ol key={k++} className="mt-3 list-decimal space-y-1 pl-6">{items}</ol>
        : <ul key={k++} className="mt-3 list-disc space-y-1 pl-6">{items}</ul>);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|\s*[-*]\s+|\s*\d+\.\s+)/.test(lines[i])) para.push(lines[i++]);
    blocks.push(<p key={k++} className="mt-3 leading-relaxed">{renderInline(para.join(" "), `p${k}`)}</p>);
  }
  return blocks;
}
