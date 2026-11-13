"use client";

import { useState, type MouseEvent } from "react";
import { Sheet } from "@/components/ui/sheet";
import { optimizeImageUrl } from "@/lib/domain/images";

/**
 * The main product photo with two ways to look closer. A mouse hover magnifies under the pointer (devices with a precise
 * pointer only, never for people who asked for reduced motion). A "Zoom photo" button opens the photo large for touch and keyboard.
 */
export function ZoomImage({ url, alt, name }: { url: string; alt: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState("50% 50%");
  const move = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setOrigin(`${Math.round(((e.clientX - r.left) / r.width) * 100)}% ${Math.round(((e.clientY - r.top) / r.height) * 100)}%`);
  };
  return (
    <div className="zoom-box relative h-full w-full overflow-hidden" onMouseMove={move}>
      {/* eslint-disable-next-line @next/next/no-img-element -- owner-supplied remote URL; size reserved by the aspect box to avoid layout shift */}
      <img key={url} src={optimizeImageUrl(url, 1000)} alt={alt || name} width={800} height={800} fetchPriority="high" decoding="async" style={{ transformOrigin: origin }}
        className="zoom-img gallery-fade h-full w-full object-contain p-3 sm:p-6" />
      <Sheet
        open={open} onOpenChange={setOpen} title={`${name}: photo`} description="Use the close button or Escape to go back."
        trigger={<span aria-hidden="true">⤢</span>} triggerLabel="Zoom photo"
        triggerClassName="absolute bottom-2 right-2 z-10 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-surface/90 text-lg font-bold shadow-md hover:bg-surface"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- owner-supplied remote URL */}
        <img src={optimizeImageUrl(url, 1600)} alt={alt || name} loading="lazy" className="mx-auto max-h-[70dvh] w-auto max-w-full object-contain" />
      </Sheet>
    </div>
  );
}
