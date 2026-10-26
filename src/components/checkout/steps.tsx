/** Three-step progress for the buying flow. Purely informational (the current step is announced to screen readers). */
export function Steps({ current }: { current: 1 | 2 | 3 }) {
  const items = ["Cart", "Your details", "Confirmation"];
  return (
    <ol className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold" aria-label="Progress">
      {items.map((t, i) => {
        const n = i + 1;
        const state = n < current ? "done" : n === current ? "current" : "todo";
        return (
          <li key={t} className="flex items-center gap-1.5" aria-current={state === "current" ? "step" : undefined}>
            <span className={`inline-flex h-6 w-6 flex-none items-center justify-center rounded-full text-[0.7rem] ${state === "todo" ? "bg-line text-muted" : "bg-ink text-white"}`}>{state === "done" ? "✓" : n}</span>
            <span className={state === "todo" ? "text-muted" : "text-text"}>{t}</span>
            {n < items.length && <span aria-hidden="true" className="hidden h-px w-4 bg-line min-[420px]:block sm:w-8" />}
          </li>
        );
      })}
    </ol>
  );
}
