"use client";

import Link from "next/link";
import { useCart } from "@/components/cart/cart-store";

export function SiteHeader({ whatsapp, account }: { whatsapp: string | null; account: { name: string } | null }) {
  const { count, ready } = useCart();
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-ink text-white">
      <div className="container-x flex h-16 items-center gap-3">
        <Link href="/" className="text-xl font-extrabold tracking-tight" aria-label="Fixit home">
          Fix<span className="text-cyan">it</span>
        </Link>
        <nav aria-label="Main" className="ml-4 hidden items-center gap-5 text-sm md:flex">
          <Link href="/shop" className="hover:text-cyan">Shop</Link>
          <Link href="/repairs" className="hover:text-cyan">Repairs</Link>
          <Link href="/blog" className="hover:text-cyan">Guides</Link>
          <Link href="/contact" className="hover:text-cyan">Contact</Link>
        </nav>
        <form action="/shop" role="search" className="ml-auto hidden flex-1 max-w-md sm:block">
          <label htmlFor="site-search" className="sr-only">Search products</label>
          <input id="site-search" name="q" type="search" placeholder="Search chargers, cases, models…"
            className="h-10 w-full rounded-full border border-white/15 bg-graphite-2 px-4 text-sm text-white placeholder:text-slate-400" />
        </form>
        <div className="ml-auto flex items-center gap-2 sm:ml-0">
          {whatsapp && (
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="hidden min-h-11 items-center rounded-full border border-white/20 px-4 text-sm font-semibold hover:bg-white/10 lg:inline-flex">
              WhatsApp
            </a>
          )}
          <Link href={account ? "/account" : "/account/login"} className="hidden min-h-11 items-center rounded-full px-3 text-sm font-semibold hover:text-cyan sm:inline-flex">{account ? "Account" : "Sign in"}</Link>
          <Link href="/cart" className="relative inline-flex min-h-11 items-center rounded-full bg-accent px-4 text-sm font-semibold hover:bg-accent-strong">
            Cart
            <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-xs font-bold text-accent" data-testid="cart-count">{ready ? count : 0}</span>
            <span className="sr-only"> items</span>
          </Link>
        </div>
      </div>
      <nav aria-label="Main mobile" className="container-x flex gap-5 overflow-x-auto pb-2 text-sm md:hidden">
        <Link href="/shop" className="py-1">Shop</Link>
        <Link href="/repairs" className="py-1">Repairs</Link>
        <Link href="/blog" className="py-1">Guides</Link>
        <Link href="/contact" className="py-1">Contact</Link>
        <Link href={account ? "/account" : "/account/login"} className="py-1 sm:hidden">{account ? "Account" : "Sign in"}</Link>
        <Link href="/shop" className="py-1 sm:hidden">Search</Link>
      </nav>
    </header>
  );
}
