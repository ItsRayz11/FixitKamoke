import { formatPKR } from "@/lib/domain/money";

export function Price({ price, salePrice, size = "md" }: { price: number; salePrice: number | null; size?: "md" | "lg" }) {
  const cls = size === "lg" ? "text-2xl" : "text-base";
  if (salePrice === null) return <span className={`${cls} font-bold text-text`}>{formatPKR(price)}</span>;
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
    </span>
  );
}
