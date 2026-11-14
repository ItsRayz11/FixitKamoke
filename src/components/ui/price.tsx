import { formatPKR } from "@/lib/domain/money";
import { percentOff } from "@/lib/domain/sale";
import { SaleTimer } from "@/components/ui/sale-timer";

export function Price({ price, salePrice, size = "md", saleMsLeft = null }: { price: number; salePrice: number | null; size?: "md" | "lg"; saleMsLeft?: number | null }) {
  const cls = size === "lg" ? "text-2xl" : "text-base";
  const pct = percentOff(price, salePrice);
  if (salePrice === null || salePrice >= price) return <span className={`${cls} font-bold text-text`}>{formatPKR(price)}</span>;
  return (
    <span className="inline-flex flex-wrap items-baseline gap-2">
      <span className={`${cls} font-bold text-text`}>
        <span className="sr-only">Sale price </span>
        {formatPKR(salePrice)}
      </span>
      <span className="text-sm text-muted line-through">
        <span className="sr-only">Original price </span>
        {formatPKR(price)}
      </span>
      {pct !== null && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-ok" data-testid="percent-off">−{pct}%<span className="sr-only"> off</span></span>}
      {saleMsLeft !== null && <span className="basis-full"><SaleTimer msLeft={saleMsLeft} /></span>}
    </span>
  );
}
