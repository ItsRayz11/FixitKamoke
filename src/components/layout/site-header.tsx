"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Sheet } from "@/components/ui/sheet";
import { useCart } from "@/components/cart/cart-store";

const links = [["Shop", "/shop"], ["Repairs", "/repairs"], ["Guides", "/blog"], ["Track order", "/track"], ["Contact", "/contact"]] as const;

function Icon({ d }: { d: string }) {
  return <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
}

/** Count badge that bumps whenever the number changes (the "cart indicator update" of the purchase response). */
function CartBadge() {
  const { count, ready } = useCart();
  const shown = ready ? count : 0;
  const prev = useRef(shown);
  const [bump, setBump] = useState(0);
  useEffect(() => {
    if (shown > prev.current) setBump((b) => b + 1);
    prev.current = shown;
  }, [shown]);
  return (
    <span key={bump} className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-xs font-bold text-accent ${bump ? "bump" : ""}`} data-testid="cart-count">
      {shown}
    </span>
  );
}

export function SiteHeader({ whatsapp, account }: { whatsapp: string | null; account: { name: string } | null }) {
  const pathname = usePathname();
  // An overlay is open only for the page it was opened on, so navigating always closes it.
  const [open, setOpen] = useState<{ kind: "menu" | "search"; path: string } | null>(null);
  const menu = open?.kind === "menu" && open.path === pathname;
  const search = open?.kind === "search" && open.path === pathname;
  const toggle = (kind: "menu" | "search") => (o: boolean) => setOpen(o ? { kind, path: pathname } : null);

  return (
    <header className="glass-nav sticky top-0 z-40 text-white" style={{ paddingTop: "var(--safe-top)" }}>
      <div className="container-x flex h-14 items-center gap-2 sm:h-16 sm:gap-3">
        <button type="button" onClick={() => toggle("menu")(true)} aria-label="Open menu" className="-ml-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full hover:bg-white/10 md:hidden">
          <Icon d="M4 7h16M4 12h16M4 17h16" />
        </button>
        <Link href="/" className="text-xl font-extrabold tracking-tight" aria-label="Fixit home">
          Fix<span className="text-cyan">it</span>
        </Link>
        <nav aria-label="Main" className="ml-4 hidden items-center gap-5 text-sm md:flex">
          <Link href="/shop" className="hover:text-cyan">Shop</Link>
          <Link href="/repairs" className="hover:text-cyan">Repairs</Link>
          <Link href="/blog" className="hover:text-cyan">Guides</Link>
          <Link href="/contact" className="hover:text-cyan">Contact</Link>
        </nav>
        <form action="/shop" role="search" className="ml-auto hidden max-w-md flex-1 sm:block">
          <label htmlFor="site-search" className="sr-only">Search products</label>
          <input id="site-search" name="q" type="search" placeholder="Search chargers, cases, models…"
            className="h-10 w-full rounded-full border border-white/15 bg-white/10 px-4 text-sm text-white placeholder:text-slate-300" />
        </form>
        <div className="ml-auto flex items-center gap-1 sm:ml-0 sm:gap-2">
          <button type="button" onClick={() => toggle("search")(true)} aria-label="Search products" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full hover:bg-white/10 sm:hidden">
            <Icon d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm9 16-4-4" />
          </button>
          {whatsapp && (
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="btn btn-glass hidden lg:inline-flex">WhatsApp</a>
          )}
          <Link href={account ? "/account" : "/account/login"} className="hidden min-h-11 items-center rounded-full px-3 text-sm font-semibold hover:text-cyan sm:inline-flex">{account ? "Account" : "Sign in"}</Link>
          <Link href="/cart" className="btn btn-primary !min-h-10 !px-3.5 sm:!min-h-11 sm:!px-4">
            <Icon d="M6 6h15l-1.5 9h-12zM6 6 5 3H2m6 17a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm10 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" />
            <CartBadge />
            <span className="sr-only"> items in cart</span>
          </Link>
        </div>
      </div>

      <Sheet side="left" open={menu} onOpenChange={toggle("menu")} title="Menu" hideTitle>
        <p className="text-xl font-extrabold">Fix<span className="text-accent">it</span></p>
        <nav aria-label="Main mobile" className="mt-4">
          <ul className="divide-y divide-line">
            {links.map(([l, h]) => (
              <li key={h}><Link href={h} className="flex min-h-12 items-center justify-between text-base font-semibold">{l}<span aria-hidden="true" className="text-muted">›</span></Link></li>
            ))}
            <li><Link href={account ? "/account" : "/account/login"} className="flex min-h-12 items-center justify-between text-base font-semibold">{account ? "My account" : "Sign in"}<span aria-hidden="true" className="text-muted">›</span></Link></li>
          </ul>
        </nav>
        <div className="mt-5 grid gap-2">
          <Link href="/repairs" className="btn btn-primary">Book a repair</Link>
          {whatsapp && <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="btn btn-ti">Ask on WhatsApp</a>}
        </div>
      </Sheet>

      <Sheet side="top" open={search} onOpenChange={toggle("search")} title="Search products" hideTitle>
        <form action="/shop" role="search" className="flex gap-2">
          <label htmlFor="m-search" className="sr-only">Search products</label>
          <input id="m-search" name="q" type="search" autoFocus placeholder="Charger, case, phone model…" className="h-12 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-line bg-surface px-4 text-base" />
          <button className="btn btn-primary">Search</button>
        </form>
        <p className="mt-3 text-xs text-muted">Tip: search by phone model, such as “iPhone 13”, to see compatible accessories.</p>
      </Sheet>
    </header>
  );
}
