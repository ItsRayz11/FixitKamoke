"use client";

import { useEffect, useRef, useState } from "react";

const WIDTHS = [
  [320, "320 compact stress test"],
  [360, "360 narrow phone"],
  [390, "390 common phone"],
  [414, "414 wide phone"],
] as const;

/**
 * Design-review frame (staff only). It embeds the real storefront in an iframe sized to a chosen CSS width, so layouts, safe areas and the
 * purchase bar can be checked without a device. It is a review aid: the production site never renders inside a frame and always uses the
 * visitor's real screen width. Real devices and browsers (dynamic toolbars, notches) still need their own check.
 */
function Frame({ path, width, label }: { path: string; width: number; label?: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [nonce, setNonce] = useState(0);
  const scroll = (to: "top" | "bottom") => {
    try {
      const w = ref.current?.contentWindow;
      w?.scrollTo({ top: to === "top" ? 0 : w.document.documentElement.scrollHeight, behavior: "smooth" });
    } catch { /* cross-origin pages cannot be scrolled; the preview only embeds this site */ }
  };
  const height = 640;
  return (
    <figure className="m-0">
      {label && <figcaption className="mb-2 text-center text-sm font-semibold">{label}</figcaption>}
      <div className="ti-surface-dark mx-auto rounded-[44px] p-[10px]" style={{ width: width + 20 }}>
        <div className="overflow-hidden rounded-[34px] bg-black">
          {/* Status bar and top inset (the area the real browser reserves for the clock and notch). */}
          <div className="relative flex h-11 items-end justify-between bg-ink px-6 pb-1 text-[11px] font-semibold text-white" aria-hidden="true">
            <span>9:41</span>
            <span className="absolute left-1/2 top-2 h-[18px] w-24 -translate-x-1/2 rounded-full bg-black" />
            <span className="tracking-widest">5G ▮▮▮</span>
          </div>
          <iframe
            key={`${path}-${width}-${nonce}`}
            ref={ref}
            src={path}
            title={`Storefront preview at ${width}px: ${path}`}
            className="block border-0 bg-white"
            style={{ width, height }}
          />
          {/* Bottom safe area with the home indicator. */}
          <div className="flex h-[22px] items-center justify-center bg-ink" aria-hidden="true"><span className="h-1 w-28 rounded-full bg-white/70" /></div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-2 text-sm">
        <button type="button" onClick={() => scroll("top")} className="btn btn-ti !min-h-10">Scroll to top</button>
        <button type="button" onClick={() => scroll("bottom")} className="btn btn-ti !min-h-10">Scroll to bottom</button>
        <button type="button" onClick={() => setNonce((n) => n + 1)} className="btn btn-ti !min-h-10">Reload</button>
      </div>
    </figure>
  );
}

/** Shrinks its content (CSS zoom keeps layout honest) so a wide device frame still fits a narrow admin screen. */
function Fit({ natural, children }: { natural: number; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setZoom(Math.min(1, el.clientWidth / natural));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [natural]);
  return <div ref={box} className="mt-6 w-full pb-6"><div style={{ zoom, width: natural }} className="mx-auto">{children}</div></div>;
}

export function PhonePreview({ pages }: { pages: { path: string; label: string }[] }) {
  const [path, setPath] = useState(pages[0]?.path ?? "/");
  const [width, setWidth] = useState<number>(390);
  const [compare, setCompare] = useState(false);

  return (
    <div>
      <div className="flex flex-wrap items-end gap-4 rounded-[var(--radius-md)] border border-line bg-surface p-4">
        <div className="w-full min-w-0 sm:w-auto">
          <label htmlFor="pv-page" className="block text-sm font-semibold">Page</label>
          <select id="pv-page" value={path} onChange={(e) => setPath(e.target.value)} className="mt-1 h-11 w-full min-w-0 rounded-[var(--radius-sm)] border border-line bg-surface px-3 text-sm sm:w-auto sm:min-w-56 sm:max-w-md">
            {pages.map((p) => <option key={p.path} value={p.path}>{p.label}</option>)}
          </select>
        </div>
        <fieldset>
          <legend className="text-sm font-semibold">Viewport width (CSS px)</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {WIDTHS.map(([w, l]) => (
              <button key={w} type="button" aria-pressed={width === w} onClick={() => setWidth(w)} title={l} className={`btn !min-h-11 ${width === w ? "btn-primary" : "btn-ti"}`}>{w}</button>
            ))}
          </div>
        </fieldset>
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} className="h-5 w-5" /> Compare 320 and {width === 320 ? 390 : width} side by side</label>
        <a href={path} target="_blank" rel="noopener noreferrer" className="btn btn-ti">Open full page</a>
      </div>
      <p className="mt-2 text-xs text-muted">Review aid only. The live site fills the visitor&apos;s real screen. Always also check on real phones and browsers (address-bar resizing, notches, keyboards).</p>

      {compare ? (
        <Fit natural={320 + 20 + 40 + (width === 320 ? 390 : width) + 20}>
          <div className="flex justify-center gap-10">
            <Frame path={path} width={320} label="320px (compact)" />
            <Frame path={path} width={width === 320 ? 390 : width} label={`${width === 320 ? 390 : width}px`} />
          </div>
        </Fit>
      ) : (
        <Fit natural={width + 20}><Frame path={path} width={width} /></Fit>
      )}
    </div>
  );
}
