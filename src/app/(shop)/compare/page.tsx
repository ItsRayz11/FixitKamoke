"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getCompareItems, type CompareItem } from "@/app/actions/compare";
import { useCompare } from "@/components/product/compare-button";
import { Price } from "@/components/ui/price";
import { StockBadge } from "@/components/product/stock-badge";

const TH = "p-3 text-left font-semibold text-muted";

export default function ComparePage() {
  const { ids, remove, clear } = useCompare();
  const [items, setItems] = useState<CompareItem[] | null>(null);
  const key = ids.join(",");
  useEffect(() => {
    if (!key) return;
    let off = false;
    getCompareItems(key.split(",")).then((r) => { if (!off) setItems(r); }).catch(() => { if (!off) setItems([]); });
    return () => { off = true; };
  }, [key]);

  const shown = key ? items : [];
  const specKeys = [...new Set((shown ?? []).flatMap((i) => Object.keys(i.specs)))];
  return (
    <div className="container-x py-6 sm:py-8">
      <title>Compare products | Fixit</title>
      <h1 className="text-2xl font-extrabold">Compare products</h1>
      {shown === null && <div className="skeleton mt-6 h-40" aria-busy="true" />}
      {shown && shown.length === 0 && (
        <p className="mt-6 rounded-[var(--radius-md)] border border-dashed border-line bg-surface p-8 text-center text-muted">
          Nothing to compare yet. Open a product and choose “Compare with other products”.{" "}
          <Link href="/shop" className="font-semibold text-accent underline">Browse the shop</Link>
        </p>
      )}
      {shown && shown.length > 0 && (
        <>
          <p className="mt-2 text-sm text-muted">Only details the shop has entered are shown. A dash means a detail has not been listed for that product.</p>
          <div className="mt-4 overflow-x-auto rounded-[var(--radius-lg)] border border-line bg-surface">
            <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
              <caption className="sr-only">Product comparison</caption>
              <thead>
                <tr>
                  <th scope="col" className={`${TH} w-28`}>Product</th>
                  {shown.map((i) => (
                    <th key={i.id} scope="col" className="p-3 align-top">
                      <div className="stage mb-2 h-24 w-24 overflow-hidden rounded-[var(--radius-sm)]">
                        {/* eslint-disable-next-line @next/next/no-img-element -- owner-supplied remote URL */}
                        {i.image && <img src={i.image} alt="" width={96} height={96} className="h-full w-full object-contain p-1" />}
                      </div>
                      <Link href={`/product/${i.slug}`} className="font-bold hover:text-accent">{i.name}</Link>
                      <button type="button" onClick={() => remove(i.id)} className="mt-1 block min-h-11 text-xs font-semibold text-danger underline">Remove</button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                <tr><th scope="row" className={TH}>Price</th>{shown.map((i) => <td key={i.id} className="p-3"><Price price={i.price} salePrice={i.salePrice} /></td>)}</tr>
                <tr><th scope="row" className={TH}>Availability</th>{shown.map((i) => <td key={i.id} className="p-3"><StockBadge stock={i.stock} /></td>)}</tr>
                <tr><th scope="row" className={TH}>Brand</th>{shown.map((i) => <td key={i.id} className="p-3">{i.brand ?? "—"}</td>)}</tr>
                <tr><th scope="row" className={TH}>Works with</th>{shown.map((i) => <td key={i.id} className="p-3">{i.devices.length ? i.devices.join(", ") : "—"}</td>)}</tr>
                {specKeys.map((k) => <tr key={k}><th scope="row" className={TH}>{k}</th>{shown.map((i) => <td key={i.id} className="p-3">{i.specs[k] ?? "—"}</td>)}</tr>)}
                <tr><th scope="row" className={TH}>Warranty</th>{shown.map((i) => <td key={i.id} className="p-3">{i.warranty ?? "—"}</td>)}</tr>
              </tbody>
            </table>
          </div>
          <button type="button" onClick={clear} className="mt-3 min-h-11 text-sm font-semibold text-muted underline">Clear comparison</button>
        </>
      )}
    </div>
  );
}
