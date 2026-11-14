"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState, useSyncExternalStore, type ReactNode } from "react";
import { Sheet } from "@/components/ui/sheet";

export interface NavItem { href: string; label: string; group: string; badge?: number }

/** One stroke path per page, in a 24x24 box. Every nav item has an icon so the compact rail stays readable. */
const ICON: Record<string, string> = {
  "/admin": "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  "/admin/analytics": "M3 4h18l-7 8v6l-4 2v-8z",
  "/admin/preview": "M8 2h8a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM11 18h2",
  "/admin/orders": "M6 6h15l-1.5 9h-12zM6 6 5 3H2",
  "/admin/repairs": "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.2-.6-.6-2.2z",
  "/admin/messages": "M4 5h16v11H8l-4 4z",
  "/admin/customers": "M16 8a4 4 0 1 0-8 0 4 4 0 0 0 8 0zM4 21a8 8 0 0 1 16 0",
  "/admin/products": "M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8",
  "/admin/categories": "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  "/admin/inventory": "M4 7h16M4 7l2-4h12l2 4M4 7v13h16V7M9 12h6",
  "/admin/coupons": "M3 12V4h8l10 10-8 8zM7.5 7.5h.01",
  "/admin/reviews": "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
  "/admin/shipping": "M3 7h11v9H3zM14 10h4l3 3v3h-7zM7 19h.01M17 19h.01",
  "/admin/payments": "M3 6h18v12H3zM3 10h18",
  "/admin/email": "M3 6h18v12H3zM3 7l9 7 9-7",
  "/admin/blog": "M5 3h14v18H5zM9 8h6M9 12h6M9 16h4",
  "/admin/subscribers": "M3 8l9 6 9-6M3 8v11h18V8M3 8l9-5 9 5",
  "/admin/settings": "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-2-4-2 .5-1.5-1L15 4h-4l-.5 2.5-1.5 1L7 7 5 11l2 1v2l-2 1 2 4 2-.5 1.5 1L11 20h4l.5-2.5 1.5-1 2 .5 2-4-2-1z",
  "/admin/users": "M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM21 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  "/admin/security": "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  "/admin/finance": "M3 3v18h18M7 15l4-4 3 3 5-6",
  "/admin/finance/purchases": "M6 6h15l-1.5 9h-12zM6 6 5 3H2M9 20h.01M17 20h.01",
  "/admin/finance/suppliers": "M3 21h18M5 21V8l7-5 7 5v13M9 12h6M9 16h6",
  "/admin/finance/counter": "M4 4h16v6H4zM6 10v10h12V10M10 14h4",
  "/admin/finance/expenses": "M12 3v18M16 7H10a3 3 0 0 0 0 6h4a3 3 0 0 1 0 6H8",
  "/admin/finance/accounts": "M3 7h18v12H3zM3 7l3-4h12l3 4M16 13h2",
  "/admin/finance/credit": "M4 6h16v12H4zM8 10h8M8 14h5",
  "/admin/finance/reports": "M5 3h14v18H5zM9 8h6M9 12h6M9 16h3",
  "/admin/finance/closing": "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 12l3 3 5-6",
  "/admin/audit": "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2",
};

function Glyph({ d, size = 22 }: { d: string; size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d={d} /></svg>;
}

const isActive = (path: string, href: string) => (href === "/admin" || href === "/admin/finance" ? path === href : path === href || path.startsWith(`${href}/`));

function Badge({ n, compact }: { n?: number; compact?: boolean }) {
  if (!n) return null;
  return <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-bold text-white ${compact ? "absolute right-1 top-1" : "ml-auto"}`} aria-label={`${n} waiting`}>{n > 99 ? "99+" : n}</span>;
}

/* A tiny persisted preference store (sidebar compact mode and which groups are folded). Server and first client render both use the
   default, so there is no hydration mismatch; the saved choice applies right after. Storage can be blocked, so every access is guarded. */
const KEY = "fixit.admin.nav";
interface Prefs { compact: boolean; closed: string[] }
const DEFAULT = JSON.stringify({ compact: false, closed: [] } satisfies Prefs);
const listeners = new Set<() => void>();
function read(): string {
  try { return window.localStorage.getItem(KEY) ?? DEFAULT; } catch { return DEFAULT; }
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => { listeners.delete(cb); window.removeEventListener("storage", cb); };
}
function usePrefs(): [Prefs, (next: Prefs) => void] {
  const raw = useSyncExternalStore(subscribe, read, () => DEFAULT);
  let prefs: Prefs;
  try { prefs = { ...JSON.parse(DEFAULT), ...JSON.parse(raw) }; } catch { prefs = JSON.parse(DEFAULT); }
  const set = useCallback((next: Prefs) => {
    try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* blocked storage: the choice just lasts until reload */ }
    listeners.forEach((l) => l());
  }, []);
  return [prefs, set];
}

function Groups({ items, path, tone, compact, closed, toggle, onTip }: {
  items: NavItem[]; path: string; tone: "dark" | "light"; compact?: boolean; closed?: string[]; toggle?: (g: string) => void;
  onTip?: (tip: { label: string; top: number } | null) => void;
}) {
  const groups = [...new Set(items.map((i) => i.group))];
  const dark = tone === "dark";
  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {groups.map((g) => {
        const folded = !compact && (closed ?? []).includes(g);
        const list = items.filter((i) => i.group === g);
        const hasActive = list.some((i) => isActive(path, i.href));
        return (
          <div key={g}>
            {compact ? <div className={`mx-3 border-t ${dark ? "border-white/10" : "border-line"}`} aria-hidden="true" />
              : toggle ? (
                <button type="button" onClick={() => toggle(g)} aria-expanded={!folded} aria-controls={`grp-${g}`}
                  className={`flex min-h-9 w-full items-center justify-between rounded-[var(--radius-sm)] px-3 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] ${dark ? "text-slate-400 hover:text-white" : "text-muted hover:text-text"}`}>
                  <span>{g}</span>
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-200 motion-reduce:transition-none ${folded ? "-rotate-90" : ""}`}><path d="m6 9 6 6 6-6" /></svg>
                </button>
              ) : <p className={`px-3 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] ${dark ? "text-slate-400" : "text-muted"}`}>{g}</p>}
            {/* Grid-row animation: height eases between 0 and its natural size without measuring it. */}
            <div id={`grp-${g}`} className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${folded && !hasActive ? "grid-rows-[0fr]" : "grid-rows-[1fr]"}`}>
              <ul className={`min-h-0 space-y-0.5 ${folded && !hasActive ? "invisible overflow-hidden" : "overflow-visible"} ${compact ? "mt-2" : "mt-1"}`}>
                {list.map((i) => {
                  const on = isActive(path, i.href);
                  return (
                    <li key={i.href} className="relative">
                      <Link
                        href={i.href}
                        aria-current={on ? "page" : undefined}
                        aria-label={compact ? i.label : undefined}
                        onMouseEnter={compact && onTip ? (e) => { const r = e.currentTarget.getBoundingClientRect(); onTip({ label: i.label, top: r.top + r.height / 2 }); } : undefined}
                        onFocus={compact && onTip ? (e) => { const r = e.currentTarget.getBoundingClientRect(); onTip({ label: i.label, top: r.top + r.height / 2 }); } : undefined}
                        onMouseLeave={compact && onTip ? () => onTip(null) : undefined}
                        onBlur={compact && onTip ? () => onTip(null) : undefined}
                        className={`relative flex min-h-11 items-center gap-3 rounded-[var(--radius-sm)] text-sm font-semibold transition-colors ${compact ? "justify-center px-0" : "px-3"} ${
                          on ? (dark ? "bg-white/12 text-white shadow-[inset_3px_0_0_var(--color-cyan)]" : "bg-accent/10 text-accent shadow-[inset_3px_0_0_var(--color-accent)]")
                             : dark ? "text-slate-300 hover:bg-white/8 hover:text-white" : "text-text hover:bg-canvas"}`}
                      >
                        <Glyph d={ICON[i.href] ?? ICON["/admin"]} size={20} />
                        {!compact && <span className="min-w-0 truncate">{i.label}</span>}
                        <Badge n={i.badge} compact={compact} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Admin chrome. Desktop (1024px+): a fixed titanium-dark sidebar that can fold groups and shrink to an icon rail. Phones and
 * tablets: a glass top bar, a thumb-reach bottom tab bar for the four queues staff open most, and a full menu drawer.
 */
export function AdminShell({ items, userLabel, signOut, children }: { items: NavItem[]; userLabel: string; signOut: ReactNode; children: ReactNode }) {
  const path = usePathname();
  const [prefs, setPrefs] = usePrefs();
  // The drawer is open only for the page it was opened on, so navigating always closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const menu = openOn === path;
  const tabs = ["/admin", "/admin/orders", "/admin/repairs", "/admin/messages"].map((h) => items.find((i) => i.href === h)).filter((i): i is NavItem => !!i);
  const toggleGroup = (g: string) => setPrefs({ ...prefs, closed: prefs.closed.includes(g) ? prefs.closed.filter((x) => x !== g) : [...prefs.closed, g] });
  const compact = prefs.compact;
  // One tooltip for the whole icon rail, positioned from the hovered icon, so the rail itself can scroll without clipping it.
  const [tip, setTip] = useState<{ label: string; top: number } | null>(null);

  return (
    <div className={`min-h-dvh bg-canvas transition-[padding] duration-200 motion-reduce:transition-none ${compact ? "lg:pl-[4.5rem]" : "lg:pl-64"}`}>
      <aside aria-label="Admin sidebar" className={`ti-surface-dark fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-white/10 text-white transition-[width] duration-200 motion-reduce:transition-none lg:flex ${compact ? "w-[4.5rem]" : "w-64"}`}>
        <div className={`flex pb-3 pt-4 ${compact ? "flex-col items-center gap-2 px-2" : "items-center justify-between px-5"}`}>
          <Link href="/admin" aria-label="Fixit admin home" className="text-xl font-extrabold tracking-tight">{compact ? <>F<span className="text-cyan">x</span></> : <>Fix<span className="text-cyan">it</span> <span className="text-xs font-medium text-slate-400">admin</span></>}</Link>
          <button type="button" onClick={() => setPrefs({ ...prefs, compact: !compact })} aria-pressed={compact} aria-label={compact ? "Expand sidebar" : "Collapse sidebar to icons"}
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-[var(--radius-sm)] text-slate-300 hover:bg-white/8 hover:text-white">
            <Glyph d={compact ? "m9 6 6 6-6 6" : "m15 6-6 6 6 6"} size={18} />
          </button>
        </div>
        <nav aria-label="Admin" className={`min-h-0 flex-1 overflow-y-auto pb-4 ${compact ? "px-2" : "px-3"}`} onScroll={() => setTip(null)}>
          <Groups items={items} path={path} tone="dark" compact={compact} closed={prefs.closed} toggle={toggleGroup} onTip={setTip} />
        </nav>
        <div className={`border-t border-white/10 text-sm ${compact ? "p-2" : "p-4"}`}>
          {!compact && <p className="truncate text-slate-300">{userLabel}</p>}
          <div className={`mt-2 flex items-center ${compact ? "flex-col gap-1" : "justify-between"}`}>
            <Link href="/" className="inline-flex min-h-11 items-center font-semibold hover:text-cyan" title="View store">{compact ? <Glyph d="M3 11l9-8 9 8M5 10v10h14V10" size={20} /> : "View store"}{compact && <span className="sr-only">View store</span>}</Link>
            <span className="[&_button]:min-h-11 [&_button]:font-semibold [&_button:hover]:text-cyan">{signOut}</span>
          </div>
        </div>
      </aside>

      {compact && tip && <span role="tooltip" className="pointer-events-none fixed left-[4.75rem] z-50 hidden -translate-y-1/2 whitespace-nowrap rounded-[var(--radius-sm)] bg-ink px-2.5 py-1.5 text-xs font-semibold text-white shadow-lg lg:block" style={{ top: tip.top }}>{tip.label}</span>}

      <header className="glass-nav sticky top-0 z-30 bg-ink/95 text-white lg:hidden" style={{ paddingTop: "var(--safe-top)" }}>
        <div className="container-x flex h-14 items-center gap-2">
          <button type="button" onClick={() => setOpenOn(path)} aria-label="Open admin menu" className="-ml-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full hover:bg-white/10">
            <Glyph d="M4 7h16M4 12h16M4 17h16" />
          </button>
          <Link href="/admin" className="text-lg font-extrabold tracking-tight">Fix<span className="text-cyan">it</span> <span className="text-xs font-medium text-slate-300">admin</span></Link>
          <Link href="/" className="btn btn-glass ml-auto !min-h-10 !px-3.5 text-sm">View store</Link>
        </div>
      </header>

      <Sheet side="left" open={menu} onOpenChange={(o) => setOpenOn(o ? path : null)} title="Admin menu" hideTitle>
        <p className="text-xl font-extrabold">Fix<span className="text-accent">it</span> <span className="text-xs font-medium text-muted">admin</span></p>
        <p className="mt-1 truncate text-xs text-muted">{userLabel}</p>
        <nav aria-label="Admin menu" className="mt-4"><Groups items={items} path={path} tone="light" closed={prefs.closed} toggle={toggleGroup} /></nav>
        <div className="mt-5 flex items-center justify-between border-t border-line pt-3 text-sm">
          <Link href="/" className="inline-flex min-h-11 items-center font-semibold text-accent">View store</Link>
          <span className="[&_button]:min-h-11 [&_button]:font-semibold">{signOut}</span>
        </div>
      </Sheet>

      <main id="admin-main" className="container-x py-5 pb-[calc(5.5rem+var(--safe-bottom))] sm:py-6 lg:pb-10">{children}</main>

      <nav aria-label="Admin quick tabs" className="glass-nav fixed inset-x-0 bottom-0 z-30 bg-ink/95 text-white lg:hidden" style={{ paddingBottom: "var(--safe-bottom)" }}>
        <ul className="mx-auto grid max-w-xl grid-cols-5">
          {tabs.map((t) => {
            const on = isActive(path, t.href);
            return (
              <li key={t.href}>
                <Link href={t.href} aria-current={on ? "page" : undefined} className={`relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-semibold ${on ? "text-cyan" : "text-slate-300"}`}>
                  <Glyph d={ICON[t.href] ?? ICON["/admin"]} />
                  {t.label}
                  {t.badge ? <span className="absolute right-[calc(50%-1.5rem)] top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[0.625rem] font-bold text-white" aria-label={`${t.badge} waiting`}>{t.badge > 99 ? "99+" : t.badge}</span> : null}
                </Link>
              </li>
            );
          })}
          <li>
            <button type="button" onClick={() => setOpenOn(path)} className="flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-semibold text-slate-300">
              <Glyph d="M5 12h.01M12 12h.01M19 12h.01" />
              More
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
}
