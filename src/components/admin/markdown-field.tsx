"use client";

import { useState } from "react";
import { renderMarkdown } from "@/lib/markdown";
import { inputCls } from "./ui";

const area = `${inputCls} h-auto py-2`;

/** A text box for owner-written text with a live "how customers will see it" preview beside or below it. Saved as plain Markdown text. */
export function MarkdownField({ id, name, label, rows = 6, defaultValue = "", maxLength, hint, required }: {
  id: string; name: string; label: string; rows?: number; defaultValue?: string; maxLength?: number; hint?: string; required?: boolean;
}) {
  const [text, setText] = useState(defaultValue);
  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold">{label}</label>
      <div className="mt-1 grid gap-3 md:grid-cols-2 [&>*]:min-w-0">
        <textarea id={id} name={name} rows={rows} value={text} maxLength={maxLength} required={required} onChange={(e) => setText(e.target.value)} className={`${area} !mt-0 font-mono`} />
        <div className="rounded-[var(--radius-sm)] border border-dashed border-line bg-canvas p-3 text-sm" aria-live="polite" data-testid={`${id}-preview`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">How customers will see it</p>
          {text.trim() ? <div className="[&>*:first-child]:mt-1">{renderMarkdown(text)}</div> : <p className="mt-1 text-muted">Nothing written yet.</p>}
        </div>
      </div>
      <p className="mt-1 text-xs text-muted">{hint ?? "Formatting: ## Heading, - list item, **bold**, *italic*. Put a blank line between paragraphs."}</p>
    </div>
  );
}
