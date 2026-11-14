/**
 * SQL for "the sale price that is in force right now". A product's sale_price only counts inside its optional window
 * (sale_starts_at .. sale_ends_at). Outside it the product sells at its regular price. Pass the table alias ("p" or "").
 */
export const saleNowSql = (alias = "p") => {
  const c = (n: string) => (alias ? `${alias}.${n}` : n);
  return `(case when (${c("sale_starts_at")} is null or ${c("sale_starts_at")} <= now()) and (${c("sale_ends_at")} is null or ${c("sale_ends_at")} > now()) then ${c("sale_price")} end)`;
};

/** SQL for "when the running sale ends", only when the owner switched the countdown on. Null otherwise. */
export const saleTimerEndSql = (alias = "p") => {
  const c = (n: string) => (alias ? `${alias}.${n}` : n);
  return `(case when ${c("sale_timer")} and ${saleNowSql(alias)} is not null then ${c("sale_ends_at")} end)`;
};

/** Sale lengths the owner can pick, in days. The end is counted from the moment of saving, to the second. */
export const SALE_LENGTH_DAYS = [1, 2, 3, 7, 14, 30] as const;

export type SaleWindow = { starts: Date | null; ends: Date | null };

/**
 * Turns what the owner entered into the stored sale window.
 * - A length (1, 2, 7 days...) starts the sale now and ends it exactly that many days later.
 * - Otherwise the typed dates are used (Pakistan time). A date left unchanged keeps its exact stored time, so saving the
 *   form for another reason never moves a sale that was set with a length down to the end of the day.
 */
export function resolveSaleWindow(i: { length: string; startsDate: string; endsDate: string; prev: SaleWindow; now?: Date }): SaleWindow | { error: string } {
  const now = i.now ?? new Date();
  if (i.length !== "") {
    const days = Number(i.length);
    if (!(SALE_LENGTH_DAYS as readonly number[]).includes(days)) return { error: "Pick a sale length from the list." };
    return { starts: now, ends: new Date(now.getTime() + days * 86_400_000) };
  }
  const keep = (typed: string, prev: Date | null, endOfDay: boolean): Date | null | "bad" => {
    if (!typed) return null;
    if (prev && instantToPktDate(prev) === typed) return prev;
    return pktDateToInstant(typed, endOfDay) ?? "bad";
  };
  const starts = keep(i.startsDate, i.prev.starts, false);
  const ends = keep(i.endsDate, i.prev.ends, true);
  if (starts === "bad" || ends === "bad") return { error: "Sale dates must be real dates." };
  if (starts && ends && ends <= starts) return { error: "The sale must end after it starts." };
  return { starts, ends };
}

export type SaleStatus =
  | { kind: "none" }
  | { kind: "scheduled"; startsAt: Date; endsAt: Date | null }
  | { kind: "running"; endsAt: Date | null; msLeft: number | null }
  | { kind: "ended"; endedAt: Date };

/** Where a product's sale stands right now. Mirrors saleNowSql: the sale price only applies inside the window. */
export function saleStatus(i: { salePrice: number | null; starts: Date | null; ends: Date | null; now?: Date }): SaleStatus {
  const now = (i.now ?? new Date()).getTime();
  if (i.salePrice === null) return { kind: "none" };
  if (i.starts && i.starts.getTime() > now) return { kind: "scheduled", startsAt: i.starts, endsAt: i.ends };
  if (i.ends && i.ends.getTime() <= now) return { kind: "ended", endedAt: i.ends };
  return { kind: "running", endsAt: i.ends, msLeft: i.ends ? i.ends.getTime() - now : null };
}

/** "2 days 5 hours", "3 hours 10 minutes", "12 minutes". */
export function longDuration(ms: number): string {
  const mins = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
  const part = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  if (d > 0) return h ? `${part(d, "day")} ${part(h, "hour")}` : part(d, "day");
  if (h > 0) return m ? `${part(h, "hour")} ${part(m, "minute")}` : part(h, "hour");
  return part(m, "minute");
}

/** A moment as Pakistan time for the admin, e.g. "21 Nov 2026, 06:30 pm". */
export function formatPkt(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }).format(d);
}

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
