import { availability } from "@/lib/domain/availability";

/** Real availability from the stock count. "Only N left" appears only when N is genuinely 3 or fewer. */
export function StockBadge({ stock }: { stock: number }) {
  const a = availability(stock);
  const map = {
    in_stock: ["In stock", "bg-emerald-50 text-ok"],
    low_stock: [`Only ${stock} left`, "bg-amber-50 text-warn"],
    out_of_stock: ["Out of stock", "bg-slate-100 text-muted"],
  } as const;
  const [label, cls] = map[a];
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}
