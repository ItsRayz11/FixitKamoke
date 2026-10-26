"use client";

import { useEffect, useRef, useState } from "react";
import { optimizeImageUrl } from "@/lib/domain/images";

/**
 * Turntable viewer: real photographs of the product taken at equal steps around it. Drag or swipe sideways to turn it (up and down
 * still scroll the page), use the arrow keys, or the two buttons. Nothing moves by itself, so it is safe for reduced-motion users.
 * Frames are fetched only when this viewer is opened, in order, so the product page itself stays light.
 */
export function SpinViewer({ frames, name }: { frames: string[]; name: string }) {
  const n = frames.length;
  const [i, setI] = useState(0);
  const [loaded, setLoaded] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; from: number; id: number } | null>(null);

  const src = (k: number) => optimizeImageUrl(frames[k], 900);
  useEffect(() => {
    let live = true;
    let count = 0;
    for (let k = 0; k < n; k++) {
      const im = new Image();
      im.onload = im.onerror = () => { if (live) setLoaded(++count); };
      im.src = src(k);
    }
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- frames are fixed for a given viewer instance
  }, []);

  const wrap = (k: number) => ((k % n) + n) % n;
  const step = (d: number) => setI((c) => wrap(c + d));

  function down(e: React.PointerEvent) {
    drag.current = { x: e.clientX, from: i, id: e.pointerId };
    box.current?.setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const w = box.current?.clientWidth ?? 300;
    // Dragging across the whole width turns the product about one and a half times: quick enough to feel direct, slow enough to stop on a frame.
    setI(wrap(d.from - Math.round(((e.clientX - d.x) / w) * n * 1.5)));
  }
  const up = () => { drag.current = null; };

  function key(e: React.KeyboardEvent) {
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); step(-1); }
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); step(1); }
    else if (e.key === "Home") { e.preventDefault(); setI(0); }
    else if (e.key === "End") { e.preventDefault(); setI(n - 1); }
  }

  return (
    <div>
      <div
        ref={box}
        role="slider"
        tabIndex={0}
        aria-label={`Turn ${name} around`}
        aria-valuemin={1}
        aria-valuemax={n}
        aria-valuenow={i + 1}
        aria-valuetext={`View ${i + 1} of ${n}`}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key}
        className="stage relative aspect-[4/5] cursor-grab select-none overflow-hidden rounded-[var(--radius-xl)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent active:cursor-grabbing sm:aspect-square"
        style={{ touchAction: "pan-y" }}
        data-testid="spin-stage"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- owner-supplied remote frames; the box reserves the size */}
        <img src={src(i)} alt="" draggable={false} width={800} height={800} className="pointer-events-none h-full w-full object-contain p-3 sm:p-6" data-testid="spin-frame" />
        {loaded < n && <p className="absolute inset-x-0 bottom-3 mx-auto w-fit rounded-full bg-ink/70 px-3 py-1 text-xs font-semibold text-white" role="status">Loading 360° view… {Math.round((loaded / n) * 100)}%</p>}
      </div>
      <div className="mt-3 flex items-center justify-center gap-3">
        <button type="button" onClick={() => step(-1)} aria-label="Turn left" className="btn btn-ti !min-h-11 !min-w-11 !px-3">‹</button>
        <p className="text-xs text-muted">Drag or swipe sideways to turn · view {i + 1} of {n}</p>
        <button type="button" onClick={() => step(1)} aria-label="Turn right" className="btn btn-ti !min-h-11 !min-w-11 !px-3">›</button>
      </div>
    </div>
  );
}
