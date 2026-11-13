/**
 * SQL for "the sale price that is in force right now". A product's sale_price only counts inside its optional window
 * (sale_starts_at .. sale_ends_at). Outside it the product sells at its regular price. Pass the table alias ("p" or "").
 */
export const saleNowSql = (alias = "p") => {
  const c = (n: string) => (alias ? `${alias}.${n}` : n);
  return `(case when (${c("sale_starts_at")} is null or ${c("sale_starts_at")} <= now()) and (${c("sale_ends_at")} is null or ${c("sale_ends_at")} > now()) then ${c("sale_price")} end)`;
};

/** Whole-number percentage off, for a badge. Only for a genuine discount; otherwise null. */
export function percentOff(price: number, salePrice: number | null): number | null {
  if (salePrice === null || !Number.isSafeInteger(price) || !Number.isSafeInteger(salePrice) || price <= 0 || salePrice >= price || salePrice < 0) return null;
  const pct = Math.round(((price - salePrice) / price) * 100);
  return pct >= 1 ? pct : null;
}

/** Dates typed in the admin are Pakistan time (UTC+5), whatever time zone the server runs in. */
export function pktDateToInstant(v: string, endOfDay: boolean): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T${endOfDay ? "23:59:59" : "00:00:00"}+05:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** YYYY-MM-DD in Pakistan time, for an <input type="date">. */
export function instantToPktDate(v: Date | string | null): string {
  if (!v) return "";
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? "" : new Date(t + 5 * 3600_000).toISOString().slice(0, 10);
}
