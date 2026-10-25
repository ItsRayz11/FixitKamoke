"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getRecentProducts, type RecentProduct } from "@/app/actions/recent";
import { formatPKR } from "@/lib/domain/money";

/** Products this visitor looked at before, read from their own browser. Renders nothing when there are none. */
export function RecentlyViewed({ excludeId }: { excludeId?: string }) {
  const [items, setItems] = useState<RecentProduct[]>([]);
  useEffect(() => {
    let ids: string[] = [];
    try { ids = JSON.parse(localStorage.getItem("fixit.recent.v1") ?? "[]"); } catch { /* ignore */ }
    ids = ids.filter((i) => i !== excludeId).slice(0, 6);
    if (ids.length === 0) return;
    getRecentProducts(ids).then(setItems).catch(() => {});
  }, [excludeId]);
  if (items.length === 0) return null;
  return (
    <section className="container-x pb-10" aria-labelledby="recent">
      <h2 id="recent" className="text-lg font-bold">Recently viewed</h2>
      <ul className="mt-3 flex gap-3 overflow-x-auto pb-2">
        {items.map((p) => (
          <li key={p.id} className="w-40 shrink-0 rounded-[var(--radius-md)] border border-line bg-surface p-3 text-sm">
            <Link href={`/product/${p.slug}`} className="font-semibold hover:text-accent">{p.name}</Link>
            <p className="mt-1">{formatPKR(p.price)}</p>
            {p.stock <= 0 && <p className="text-xs text-muted">Out of stock</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
