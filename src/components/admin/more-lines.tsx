"use client";

import { Children, useState, type ReactNode } from "react";

/** Shows the first few item rows and reveals more one at a time, so a long invoice does not need a long empty form. All rows stay in the form. */
export function MoreLines({ children, initial = 4, label = "Add another item" }: { children: ReactNode; initial?: number; label?: string }) {
  const rows = Children.toArray(children);
  const [shown, setShown] = useState(initial);
  return (
    <>
      {rows.map((r, i) => <div key={i} className={i >= shown ? "hidden" : "contents"}>{r}</div>)}
      {shown < rows.length && (
        <button type="button" onClick={() => setShown((s) => Math.min(rows.length, s + 1))} className="min-h-11 rounded-[var(--radius-sm)] border border-dashed border-line px-4 text-sm font-semibold text-accent">
          + {label} ({rows.length - shown} more allowed)
        </button>
      )}
    </>
  );
}
