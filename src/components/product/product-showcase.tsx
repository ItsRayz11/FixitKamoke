"use client";

import { optimizeImageUrl } from "@/lib/domain/images";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Price } from "@/components/ui/price";
import { Spotlight } from "@/components/ui/spotlight";
import { StockBadge } from "@/components/product/stock-badge";
import { useCart } from "@/components/cart/cart-store";
import { CompareButton } from "@/components/product/compare-button";
import { SpinViewer } from "@/components/product/spin-viewer";
import { StockAlertForm } from "@/components/product/stock-alert-form";
import { displayName } from "@/lib/domain/display";
import { formatPKR } from "@/lib/domain/money";

export interface ShowcaseVariant {
  id: string; slug: string; label: string; hex: string | null; price: number; salePrice: number | null; stock: number;
  images: { url: string; alt: string }[]; spin: string[];
}
export interface ShowcaseBase {
  id: string; slug: string; name: string; brand: string | null; description: string; price: number; salePrice: number | null; stock: number;
  images: { url: string; alt: string }[]; spin: string[];
}

const eff = (v: { price: number; salePrice: number | null }) => v.salePrice ?? v.price;

/**
 * The top of a mobile product page, in the order the brief asks for: image showcase, gallery controls, name and description,
 * price and availability, finish choice, [compatibility + key specs slot], add to cart, [delivery/returns/warranty slot].
 * Finishes are real products with real photos: choosing one swaps the photos, price and stock together, and the address
 * bar follows (history.replaceState) so a refresh or a shared link lands on the same finish.
 * On phones a compact purchase bar stays reachable at the bottom edge while the main button is off screen.
 */
export function ProductShowcase({ base, variants, required, specsSlot, afterBuySlot }: {
  base: ShowcaseBase; variants: ShowcaseVariant[]; required: boolean; specsSlot: ReactNode; afterBuySlot: ReactNode;
}) {
  const cart = useCart();
  const choices = variants.length > 1 ? variants : [];
  const mustChoose = required && choices.length > 1;
  const [selectedId, setSelectedId] = useState<string | null>(mustChoose ? null : base.id);
  const [photo, setPhoto] = useState(0);
  const [spinOn, setSpinOn] = useState(false);
  const [qty, setQty] = useState(1);
  const [choiceError, setChoiceError] = useState(false);
  const [done, setDone] = useState(false);
  const [barShown, setBarShown] = useState(false);
  const [typing, setTyping] = useState(false);
  const mainBtn = useRef<HTMLButtonElement>(null);
  const radios = useRef<(HTMLButtonElement | null)[]>([]);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const touchX = useRef<number | null>(null);

  const selected = choices.find((v) => v.id === selectedId) ?? null;
  const unselected = mustChoose && !selected;
  // What the page currently describes: the chosen finish, or (before a required choice) the product it opened on.
  const view = selected ?? base;
  const label = selected?.label ?? null;
  const images = (selected ?? base).images;
  const frames = (selected ?? base).spin;
  const canSpin = frames.length >= 8;
  const inCart = cart.lines.find((l) => l.productId === view.id)?.quantity ?? 0;
  const limit = Math.max(0, view.stock - inCart);
  const soldOut = !unselected && view.stock <= 0;
  const atLimit = !unselected && !soldOut && limit <= 0;
  const disabled = soldOut || atLimit;
  const lowest = choices.length ? Math.min(...choices.map(eff)) : eff(base);
  const showFrom = unselected && choices.some((c) => eff(c) !== lowest);

  // The purchase bar only appears while the main button is off screen, and steps aside while a form field is in use.
  useEffect(() => {
    const el = mainBtn.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setBarShown(!e.isIntersecting), { threshold: 0.6 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    const field = (t: EventTarget | null) => t instanceof HTMLElement && (/^(TEXTAREA|SELECT)$/.test(t.tagName) || (t instanceof HTMLInputElement && !/^(checkbox|radio|button|submit)$/.test(t.type)));
    const on = (e: FocusEvent) => field(e.target) && setTyping(true);
    const off = () => setTyping(false);
    document.addEventListener("focusin", on);
    document.addEventListener("focusout", off);
    return () => { document.removeEventListener("focusin", on); document.removeEventListener("focusout", off); };
  }, []);
  const barOn = barShown && !typing;
  useEffect(() => {
    document.body.dataset.purchaseBar = barOn ? "on" : "off";
    return () => { delete document.body.dataset.purchaseBar; };
  }, [barOn]);
  useEffect(() => () => clearTimeout(doneTimer.current), []);

  function choose(id: string) {
    const v = choices.find((c) => c.id === id);
    if (!v) return;
    setSelectedId(id); setPhoto(0); setSpinOn(false); setQty(1); setChoiceError(false);
    try { window.history.replaceState(null, "", `/product/${v.slug}`); } catch { /* address bar sync is optional */ }
  }
  function onRadioKey(e: React.KeyboardEvent, i: number) {
    const n = choices.length;
    const to = e.key === "ArrowRight" || e.key === "ArrowDown" ? (i + 1) % n : e.key === "ArrowLeft" || e.key === "ArrowUp" ? (i - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    radios.current[to]?.focus();
    choose(choices[to].id);
  }

  function add() {
    if (unselected) {
      setChoiceError(true);
      const target = radios.current[0];
      target?.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      target?.focus({ preventScroll: true });
      return;
    }
    if (disabled) return;
    cart.add(view.id, Math.min(qty, limit), displayName(base.name, label));
    setDone(true);
    clearTimeout(doneTimer.current);
    doneTimer.current = setTimeout(() => setDone(false), 1600);
  }

  const ctaText = unselected ? "Choose a finish" : soldOut ? "Out of stock" : atLimit ? "Maximum in cart" : done ? "Added" : "Add to cart";
  const ctaClass = `btn btn-primary ${done ? "btn-done" : ""}`;
  const cur = images[Math.min(photo, Math.max(0, images.length - 1))];
  const shifted = (d: number) => images.length > 1 && setPhoto((p) => (p + d + images.length) % images.length);

  return (
    <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-10">
      {/* 3 + 4: image showcase and gallery controls */}
      <div className="lg:sticky lg:top-24">
        {spinOn && canSpin ? (
          <SpinViewer key={view.id} frames={frames} name={displayName(base.name, label)} />
        ) : images.length === 0 ? (
          <div className="stage flex aspect-[4/5] items-center justify-center rounded-[var(--radius-xl)] p-6 text-center text-sm text-muted sm:aspect-square">
            {selected ? `A photo of the ${selected.label} finish is coming soon.` : "Photo coming soon"}
          </div>
        ) : (
          <Spotlight className="rounded-[var(--radius-xl)]">
            <div
              key={`${view.id}-sweep`}
              className="stage sweep sweep-play aspect-[4/5] overflow-hidden rounded-[var(--radius-xl)] sm:aspect-square"
              onTouchStart={(e) => { touchX.current = e.touches[0]?.clientX ?? null; }}
              onTouchEnd={(e) => {
                const x0 = touchX.current; touchX.current = null;
                const x1 = e.changedTouches[0]?.clientX;
                if (x0 !== null && x1 !== undefined && Math.abs(x1 - x0) > 48) shifted(x1 < x0 ? 1 : -1);
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- owner-supplied remote URL; size reserved by the aspect box to avoid layout shift */}
              <img key={cur.url} src={optimizeImageUrl(cur.url, 1000)} alt={cur.alt || base.name} width={800} height={800} fetchPriority="high" decoding="async" className="gallery-fade h-full w-full object-contain p-3 sm:p-6" />
            </div>
          </Spotlight>
        )}
        {canSpin && (
          <button type="button" onClick={() => setSpinOn((o) => !o)} aria-pressed={spinOn} className="btn btn-ti mt-3 !min-h-11 w-full sm:w-auto">
            {spinOn ? "Back to photos" : "360° view"}
          </button>
        )}
        {!spinOn && images.length > 1 && (
          <ul className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Product photos">
            {images.map((im, n) => (
              <li key={im.url}>
                <button type="button" onClick={() => setPhoto(n)} aria-label={`Show photo ${n + 1} of ${images.length}`} aria-pressed={n === photo}
                  className={`stage block h-14 w-14 overflow-hidden rounded-[var(--radius-sm)] !border-2 sm:h-16 sm:w-16 ${n === photo ? "!border-accent" : ""}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- owner-supplied remote URL */}
                  <img src={optimizeImageUrl(im.url, 160)} alt="" width={64} height={64} loading="lazy" className="h-full w-full object-contain p-1" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-5 lg:mt-0">
        {/* 5: name and concise description */}
        {base.brand && <p className="text-xs font-semibold uppercase tracking-widest text-muted">{base.brand}</p>}
        <h1 className="mt-1 text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">{base.name}</h1>
        {base.description && <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted">{base.description}</p>}

        {/* 6: price and verified availability */}
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          {showFrom
            ? <span className="text-2xl font-bold"><span className="mr-1 text-sm font-semibold text-muted">From</span>{" "}{formatPKR(lowest)}</span>
            : <Price price={view.price} salePrice={view.salePrice} size="lg" />}
          {!unselected && <StockBadge stock={view.stock} />}
        </div>
        <p className="mt-1 text-xs text-muted" aria-live="polite">
          {unselected ? "Choose a finish to see its exact price and stock." : "Stock is checked again when you place your order."}
        </p>

        {/* 7: finish selection */}
        {choices.length > 0 && (
          <fieldset className="mt-5">
            <legend className="text-sm font-semibold">
              Finish{selected && <>: <span className="font-bold" data-testid="finish-name">{selected.label}</span></>}
              {required && <span className="ml-2 text-xs font-medium text-muted">(required)</span>}
            </legend>
            <div role="radiogroup" aria-label="Finish" className="mt-2 flex flex-wrap gap-2.5">
              {choices.map((v, i) => {
                const on = v.id === selectedId;
                return (
                  <button
                    key={v.id}
                    ref={(el) => { radios.current[i] = el; }}
                    type="button" role="radio" aria-checked={on}
                    tabIndex={on || (!selectedId && i === 0) ? 0 : -1}
                    onClick={() => choose(v.id)} onKeyDown={(e) => onRadioKey(e, i)}
                    className="swatch"
                  >
                    <span className="swatch-dot" style={{ background: v.hex ?? "#cbd2dd" }} aria-hidden="true" />
                    <span>{v.label}{v.stock <= 0 && <span className="ml-1 text-xs font-medium text-muted">(sold out)</span>}</span>
                  </button>
                );
              })}
            </div>
            {choiceError && <p role="alert" className="mt-2 text-sm font-semibold text-danger">Please choose a finish before adding this to your cart.</p>}
          </fieldset>
        )}

        {/* 8: compatibility and key specifications */}
        {specsSlot}

        {/* 9: prominent add to cart */}
        <div className="mt-6 flex items-stretch gap-3">
          <div className="btn-ti inline-flex items-center rounded-[var(--radius-sm)]" role="group" aria-label="Quantity">
            <button type="button" className="min-h-11 w-11 text-lg" aria-label="Decrease quantity" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={disabled || unselected}>−</button>
            <span className="w-8 text-center text-sm font-semibold" aria-live="polite">{Math.min(qty, Math.max(1, limit))}</span>
            <button type="button" className="min-h-11 w-11 text-lg" aria-label="Increase quantity" onClick={() => setQty((q) => Math.min(Math.max(1, limit), q + 1))} disabled={disabled || unselected}>+</button>
          </div>
          <button ref={mainBtn} type="button" onClick={add} disabled={disabled} className={`${ctaClass} flex-1 !min-h-12`}>
            {done && <svg aria-hidden="true" className="check-pop" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
            {ctaText}
          </button>
        </div>
        <p className="sr-only" role="status">{done ? `${displayName(base.name, label)} added to your cart` : ""}</p>
        {soldOut && <StockAlertForm key={view.id} productId={view.id} name={displayName(base.name, label)} />}

        {/* 10: delivery, returns, warranty (and the wishlist / help links) */}
        {afterBuySlot}
        <CompareButton productId={base.id} />
      </div>

      {/* Compact purchase bar (phones and tablets): visible only while the main button is off screen. */}
      {barOn && (
        <div className="purchase-bar lg:hidden" data-testid="purchase-bar">
          <div className="glass-panel mx-auto flex max-w-xl items-center gap-3 rounded-[var(--radius-lg)] p-2.5 pl-4">
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-xs text-muted">{label ?? base.name}</p>
              <p className="whitespace-nowrap text-[0.95rem] font-extrabold">{showFrom ? `From ${formatPKR(lowest)}` : formatPKR(eff(view))}</p>
            </div>
            <button type="button" onClick={add} disabled={disabled} className={`${ctaClass} !min-h-12 min-w-32 !px-4`} data-bar="true">
              {ctaText}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
