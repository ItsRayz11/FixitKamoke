"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Sheet } from "@/components/ui/sheet";

export interface NavItem { href: string; label: string; group: string; badge?: number }

const ICON: Record<string, string> = {
  "/admin": "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  "/admin/orders": "M6 6h15l-1.5 9h-12zM6 6 5 3H2",
  "/admin/repairs": "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.2-.6-.6-2.2z",
  "/admin/messages": "M4 5h16v11H8l-4 4z",
};

function Glyph({ d }: { d: string }) {
  return <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
}

const isActive = (path: string, href: string) => (href === "/admin" ? path === "/admin" : path === href || path.startsWith(`${href}/`));

function Badge({ n }: { n?: number }) {
  if (!n) return null;
  return <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-bold text-white" aria-label={`${n} waiting`}>{n > 99 ? "99+" : n}</span>;
}

function Groups({ items, path, tone }: { items: NavItem[]; path: string; tone: "dark" | "light" }) {
  const groups = [...new Set(items.map((i) => i.group))];
  const dark = tone === "dark";
  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <div key={g}>
          <p className={`px-3 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] ${dark ? "text-slate-400" : "text-muted"}`}>{g}</p>
          <ul className="mt-1.5 space-y-0.5">
            {items.filter((i) => i.group === g).map((i) => {
              const on = isActive(path, i.href);
              return (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    aria-current={on ? "page" : undefined}
                    className={`flex min-h-11 items-center gap-2 rounded-[var(--radius-sm)] px-3 text-sm font-semibold transition-colors ${
                      on ? (dark ? "bg-white/12 text-white shadow-[inset_2px_0_0_var(--color-cyan)]" : "bg-accent/10 text-accent")
                         : dark ? "text-slate-300 hover:bg-white/8 hover:text-white" : "text-text hover:bg-canvas"}`}
                  >
                    {i.label}<Badge n={i.badge} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * Admin chrome. Desktop (1024px+): a fixed titanium-dark sidebar. Phones and tablets: a glass top bar,
 * a thumb-reach bottom tab bar for the four queues staff open most, and a full menu drawer.
 */
export function AdminShell({ items, userLabel, signOut, children }: { items: NavItem[]; userLabel: string; signOut: ReactNode; children: ReactNode }) {
  const path = usePathname();
  // The drawer is open only for the page it was opened on, so navigating always closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const menu = openOn === path;
  const tabs = ["/admin", "/admin/orders", "/admin/repairs", "/admin/messages"].map((h) => items.find((i) => i.href === h)).filter((i): i is NavItem => !!i);

  return (
    <div className="min-h-dvh bg-canvas lg:pl-64">
      <aside aria-label="Admin sidebar" className="ti-surface-dark fixed inset-y-0 left-0 z-30 hidden w-64 flex-col overflow-y-auto border-r border-white/10 text-white lg:flex">
        <div className="px-5 pb-3 pt-5">
          <Link href="/admin" className="text-xl font-extrabold tracking-tight">Fix<span className="text-cyan">it</span> <span className="text-xs font-medium text-slate-400">admin</span></Link>
        </div>
        <nav aria-label="Admin" className="flex-1 px-3 pb-4"><Groups items={items} path={path} tone="dark" /></nav>
        <div className="border-t border-white/10 p-4 text-sm">
          <p className="truncate text-slate-300">{userLabel}</p>
          <div className="mt-2 flex items-center justify-between">
            <Link href="/" className="inline-flex min-h-11 items-center font-semibold hover:text-cyan">View store</Link>
            <span className="[&_button]:min-h-11 [&_button]:font-semibold [&_button:hover]:text-cyan">{signOut}</span>
          </div>
        </div>
      </aside>

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
        <nav aria-label="Admin menu" className="mt-4"><Groups items={items} path={path} tone="light" /></nav>
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
