"use client";

import { useState } from "react";

/** Main photo plus thumbnails. Keyboard and screen-reader friendly; the switch is a short fade (skipped for reduced motion). */
export function ProductGallery({ images, name }: { images: { url: string; alt: string }[]; name: string }) {
  const [i, setI] = useState(0);
  if (images.length === 0) {
    return <div className="flex aspect-square items-center justify-center overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface text-muted">Photo coming soon</div>;
  }
  const cur = images[Math.min(i, images.length - 1)];
  return (
    <div>
      <div className="aspect-square overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface">
        {/* eslint-disable-next-line @next/next/no-img-element -- owner-supplied remote URL; size reserved by the aspect box to avoid layout shift */}
        <img key={cur.url} src={cur.url} alt={cur.alt || name} width={800} height={800} fetchPriority={i === 0 ? "high" : "auto"} className="gallery-fade h-full w-full object-cover" />
      </div>
      {images.length > 1 && (
        <ul className="mt-3 flex gap-2 overflow-x-auto" aria-label="Product photos">
          {images.map((im, n) => (
            <li key={im.url}>
              <button type="button" onClick={() => setI(n)} aria-label={`Show photo ${n + 1} of ${images.length}`} aria-pressed={n === i}
                className={`block h-16 w-16 overflow-hidden rounded-[var(--radius-sm)] border-2 ${n === i ? "border-accent" : "border-line"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- owner-supplied remote URL */}
                <img src={im.url} alt="" width={64} height={64} loading="lazy" className="h-full w-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
