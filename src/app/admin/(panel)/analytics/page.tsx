import { requireAdmin } from "@/lib/auth/session";
import { getDashboardStats, getFunnelReport, type FunnelRow } from "@/lib/admin/stats";

export const dynamic = "force-dynamic";

/** Below this many events a ratio is shown as "not enough data" rather than a number that looks meaningful. */
const MIN_SAMPLE = 30;

const total = (r?: FunnelRow) => (r ? r.mobile + r.desktop + r.unknown : 0);
function ratio(num: number, den: number): string {
  if (den < MIN_SAMPLE) return den === 0 ? "No data yet" : `Not enough data (${den} so far)`;
  return `${((num / den) * 100).toFixed(1)}%`;
}

export default async function Analytics() {
  await requireAdmin("manager");
  const [f, s] = await Promise.all([getFunnelReport(), getDashboardStats()]);
  const get = (n: string) => f[n];

  const steps: { label: string; num: string; den: string }[] = [
    { label: "Listing to product page", num: "product_click", den: "listing_view" },
    { label: "Product page to add-to-cart", num: "add_to_cart", den: "product_view" },
    { label: "Cart to checkout started", num: "checkout_start", den: "cart_view" },
    { label: "Checkout started to order placed", num: "order_placed", den: "checkout_start" },
    { label: "Repair page to repair request", num: "repair_submitted", den: "repair_start" },
  ];
  const side = (n: string, d: string, dev: "mobile" | "desktop") => ratio(get(n)?.[dev] ?? 0, get(d)?.[dev] ?? 0);

  return (
    <div>
      <h1 className="text-2xl font-extrabold">Funnel and retention</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Counts from the last 30 days. Events store only a name, a page path and whether the screen was phone-width: no names, phone numbers,
        IP addresses or cookies. Browsers that send Do Not Track or Global Privacy Control are not counted, so numbers understate real traffic.
        A ratio is only shown once there are at least {MIN_SAMPLE} events to divide by.
      </p>

      <div className="mt-5 overflow-x-auto rounded-[var(--radius-md)] border border-line bg-surface">
        <table className="w-full min-w-[34rem] text-left text-sm">
          <caption className="sr-only">Conversion steps</caption>
          <thead className="bg-canvas text-muted"><tr><th scope="col" className="p-3">Step</th><th scope="col" className="p-3">All screens</th><th scope="col" className="p-3">Phones</th><th scope="col" className="p-3">Larger screens</th></tr></thead>
          <tbody className="divide-y divide-line">
            {steps.map((st) => (
              <tr key={st.label}>
                <th scope="row" className="p-3 font-semibold">{st.label}</th>
                <td className="p-3">{ratio(total(get(st.num)), total(get(st.den)))}</td>
                <td className="p-3">{side(st.num, st.den, "mobile")}</td>
                <td className="p-3">{side(st.num, st.den, "desktop")}</td>
              </tr>
            ))}
            <tr>
              <th scope="row" className="p-3 font-semibold">Checkout form errors per checkout started</th>
              <td className="p-3">{ratio(total(get("checkout_error")), total(get("checkout_start")))}</td>
              <td className="p-3">{side("checkout_error", "checkout_start", "mobile")}</td>
              <td className="p-3">{side("checkout_error", "checkout_start", "desktop")}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">“Order placed” is counted on the server and has no screen size, so it only appears in the all-screens column.</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-[var(--radius-md)] border border-line bg-surface p-4"><p className="text-sm text-muted">Cancellation rate (30 days)</p><p className="mt-1 text-2xl font-extrabold">{s.cancelRate === null ? "Not enough data" : `${(s.cancelRate * 100).toFixed(1)}%`}</p></div>
        <div className="rounded-[var(--radius-md)] border border-line bg-surface p-4"><p className="text-sm text-muted">Repeat customers</p><p className="mt-1 text-2xl font-extrabold">{s.repeatRate === null ? "Not enough data" : `${(s.repeatRate * 100).toFixed(1)}%`}</p><p className="mt-1 text-xs text-muted">Share of phone numbers with 2 or more orders.</p></div>
        <div className="rounded-[var(--radius-md)] border border-line bg-surface p-4"><p className="text-sm text-muted">Orders, last 30 days</p><p className="mt-1 text-2xl font-extrabold">{s.orders30}</p></div>
      </div>

      <section className="mt-6 rounded-[var(--radius-md)] border border-line bg-surface p-4 text-sm" aria-labelledby="exp">
        <h2 id="exp" className="font-bold">About layout experiments</h2>
        <p className="mt-1 text-muted">No A/B test is running. With the small traffic of a new shop, a test would not reach a trustworthy result. Use this baseline, change one thing at a time, and compare a few weeks before and after. Do not treat a design as an improvement without these numbers.</p>
      </section>
    </div>
  );
}
