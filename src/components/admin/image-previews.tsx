"use client";

import { useEffect, useState } from "react";

/** Live thumbnails for the links typed or uploaded into the textarea named by `targetId`. Reads the box directly, so it also updates after an upload. */
export function ImagePreviews({ targetId, label }: { targetId: string; label: string }) {
  const [items, setItems] = useState<{ url: string; alt: string }[]>([]);
  const [failed, setFailed] = useState<Set<string>>(new Set());

  useEffect(() => {
    const box = document.getElementById(targetId) as HTMLTextAreaElement | null;
    if (!box) return;
    const read = () => {
      const out: { url: string; alt: string }[] = [];
      for (const line of box.value.split(/\r?\n/)) {
        const [u, ...alt] = line.split("|");
        const url = u?.trim();
        if (url && /^https:\/\//i.test(url)) out.push({ url, alt: alt.join("|").trim() });
      }
      setItems(out.slice(0, 24));
    };
    read();
    box.addEventListener("input", read);
    return () => box.removeEventListener("input", read);
  }, [targetId]);

  if (items.length === 0) return <p className="text-xs text-muted">{label}: nothing added yet.</p>;
  return (
    <div>
      <p className="text-xs font-semibold text-muted">{label}: {items.length}</p>
      <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5" aria-label={label}>
        {items.map((it, i) => (
          <li key={`${it.url}-${i}`} className="min-w-0">
            <div className="aspect-square overflow-hidden rounded-[var(--radius-sm)] border border-line bg-canvas">
              {failed.has(it.url)
                ? <span className="grid h-full place-items-center p-1 text-center text-[0.6875rem] text-danger">Cannot load this link</span>
                // eslint-disable-next-line @next/next/no-img-element
                : <img src={it.url} alt={it.alt || `${label} ${i + 1}`} loading="lazy" onError={() => setFailed((f) => new Set(f).add(it.url))} className="h-full w-full object-contain" />}
            </div>
            <p className="mt-0.5 truncate text-[0.6875rem] text-muted">{i === 0 ? "Main photo" : `Photo ${i + 1}`}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
