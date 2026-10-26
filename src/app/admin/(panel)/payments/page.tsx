import Link from "next/link";
import { site } from "@/config/site";
import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getStore } from "@/lib/settings";
import { gatewayStatuses, getPaymentOptions, type GatewayStatus } from "@/lib/payments";
import { Banner, Card, fmtDate, td, th } from "@/components/admin/ui";
import { formatPKR } from "@/lib/domain/money";
import { setGatewayModeAction } from "./actions";

export const dynamic = "force-dynamic";

const STAGE: Record<GatewayStatus["stage"], { label: string; tone: string }> = {
  not_built: { label: "Not built", tone: "bg-slate-100 text-muted" },
  needs_credentials: { label: "Needs credentials", tone: "bg-amber-50 text-warn" },
  off: { label: "Off", tone: "bg-slate-100 text-muted" },
  testing: { label: "Testing (staff only)", tone: "bg-blue-50 text-accent" },
  ready_to_go_live: { label: "Test passed: ready to go live", tone: "bg-emerald-50 text-ok" },
  live: { label: "Live", tone: "bg-emerald-50 text-ok" },
};

function ModeButton({ id, mode, children, primary }: { id: string; mode: string; children: React.ReactNode; primary?: boolean }) {
  return (
    <form action={setGatewayModeAction}>
      <input type="hidden" name="id" value={id} /><input type="hidden" name="mode" value={mode} />
      <button className={`min-h-11 rounded-[var(--radius-sm)] px-4 text-sm font-semibold ${primary ? "bg-accent text-white hover:bg-accent-strong" : "border border-line bg-surface"}`}>{children}</button>
    </form>
  );
}

export default async function PaymentsAdmin({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireAdmin("owner");
  const sp = await searchParams;
  const db = await getDb();
  const [opts, store, gateways] = await Promise.all([getPaymentOptions(db), getStore(), gatewayStatuses(db)]);
  const unpaid = (await db.query<{ n: number }>("select count(*)::int as n from orders where payment_method = 'bank_transfer' and payment_status in ('unpaid','pending') and status not in ('cancelled','rejected')"))[0]?.n ?? 0;
  const awaiting = await db.query<{ id: string; order_number: string; total: number; created_at: string; provider: string | null }>(
    "select id, order_number, total, created_at, payment_provider as provider from orders where payment_method = 'online' and payment_status in ('pending','failed','unpaid') and status not in ('cancelled','rejected') order by created_at desc limit 20");
  const events = await db.query<{ provider: string; received_at: string; verified: boolean; outcome: string; reason: string | null; reference: string | null }>(
    "select provider, received_at, verified, outcome, reason, reference from payment_events order by received_at desc limit 25");
  const local = /localhost|127\.0\.0\.1/.test(site.baseUrl);

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-extrabold">Payments</h1>
      <Banner ok={sp.ok} error={sp.error} />

      <Card title="Working today (no merchant account needed)" id="offline">
        <ul className="mt-2 space-y-2 text-sm">
          <li><strong>Cash on delivery:</strong> {opts.cod ? "on" : "off"}. Also limited by each delivery zone.</li>
          <li><strong>Bank transfer and wallets sent by hand:</strong> {opts.bankTransfer ? "on" : "off"}. {store.bankAccountNumber || store.paymentInstructions ? "Your details are shown to customers on their confirmation page, with a box to send the transaction ID." : "No details saved, so customers are told you will send them."} {unpaid > 0 && <span className="font-semibold text-warn">{unpaid} order{unpaid === 1 ? " is" : "s are"} waiting for payment confirmation.</span>}</li>
        </ul>
        <p className="mt-3 text-sm text-muted">
          These are <strong>not detected automatically</strong>: money sent to a bank account or a personal JazzCash / Easypaisa wallet gives the shop no signal, so staff check the banking app and mark the order paid on its page.
          Change the details in <Link href="/admin/settings" className="font-semibold text-accent underline">Store settings</Link>.
        </p>
      </Card>

      <Card title="Online payment gateways (automatic detection)" id="online">
        <p className="mt-2 text-sm text-muted">
          With a <strong>merchant account</strong>, the provider tells our server the moment a customer pays, using a signed message, and the order is marked paid by itself. We accept it only if the signature, our reference and the exact amount all match.
          A gateway moves through three steps: <strong>off</strong>, then <strong>testing</strong> (only signed-in staff see it at checkout, so you can make a small real or sandbox payment), then <strong>live</strong> once the provider has confirmed that test payment to us.
        </p>
        {local && <p role="alert" className="mt-3 rounded-[var(--radius-sm)] bg-amber-50 p-3 text-sm font-semibold text-warn">The site address is still {site.baseUrl}. Set SITE_URL on your host first: the providers cannot reach a local address, and return links would be wrong.</p>}
        <ul className="mt-4 divide-y divide-line">
          {gateways.map((g) => (
            <li key={g.id} className="py-4 text-sm">
              <p className="flex flex-wrap items-center gap-2 font-semibold">{g.name} <span className={`rounded px-2 py-0.5 text-xs ${STAGE[g.stage].tone}`}>{STAGE[g.stage].label}</span></p>
              <p className="mt-1 text-muted">{g.detection}</p>
              <p className="mt-1 text-muted">{g.notes}</p>
              {g.implemented && (
                <>
                  <p className="mt-2"><strong>Server settings:</strong> {g.requiredEnv.map((k) => <code key={k} className="mr-2 inline-block max-w-full break-all rounded bg-canvas px-1.5 py-0.5 text-xs">{k}</code>)} {g.credentialsPresent ? <span className="font-semibold text-ok">all set</span> : <span className="font-semibold text-warn">not all set</span>}</p>
                  {g.callbackPath && <p className="mt-1"><strong>Give the provider this address:</strong> <code className="break-all rounded bg-canvas px-1.5 py-0.5 text-xs">{site.baseUrl}{g.callbackPath}</code></p>}
                  {g.credentialsPresent && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {g.mode === "off" && <ModeButton id={g.id} mode="testing" primary>Start testing (staff only)</ModeButton>}
                      {g.mode === "testing" && <ModeButton id={g.id} mode="off">Switch off</ModeButton>}
                      {g.mode === "testing" && g.verified && <ModeButton id={g.id} mode="live" primary>Go live for customers</ModeButton>}
                      {g.mode === "live" && <ModeButton id={g.id} mode="off">Switch off</ModeButton>}
                    </div>
                  )}
                  {g.mode === "testing" && !g.verified && <p className="mt-2 text-muted">Now sign in as staff, add a low-priced item to the cart and choose this gateway at checkout. Pay with the provider&apos;s sandbox test details (or a small real amount). When the provider&apos;s confirmation arrives it appears in the log below and <strong>Go live</strong> unlocks. Cancel the test order afterwards, and refund any real money in the provider&apos;s dashboard.</p>}
                </>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {awaiting.length > 0 && (
        <Card title="Online orders still waiting for payment" id="awaiting">
          <p className="mt-2 text-sm text-muted">Stock is held for these. If a customer has walked away, cancel the order from its page to put the items back on the shelf.</p>
          <ul className="mt-2 divide-y divide-line text-sm">
            {awaiting.map((o) => <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><Link className="font-semibold text-accent" href={`/admin/orders/${o.id}`}>{o.order_number}</Link><span>{formatPKR(o.total)} · {o.provider ?? "online"} · {fmtDate(o.created_at)}</span></li>)}
          </ul>
        </Card>
      )}

      <Card title="What the providers have sent us" id="events">
        <p className="mt-2 text-sm text-muted">Every notification that reached the shop, whether accepted or refused, and why. Contains no card or customer details. If a gateway is not working, the reason shows here.</p>
        {events.length === 0 ? <p className="mt-3 text-sm text-muted">Nothing received yet.</p> : (
          <div className="mt-3 overflow-x-auto rounded-[var(--radius-md)] border border-line">
            <table className="w-full">
              <thead className="border-b border-line"><tr><th className={th}>When</th><th className={th}>Provider</th><th className={th}>Signature</th><th className={th}>Result</th><th className={th}>Note</th></tr></thead>
              <tbody className="divide-y divide-line">
                {events.map((e, i) => <tr key={i}><td className={td}>{fmtDate(e.received_at)}</td><td className={td}>{e.provider}</td><td className={td}>{e.verified ? "valid" : "REFUSED"}</td><td className={td}>{e.outcome.replace(/_/g, " ")}</td><td className={`${td} max-w-xs break-words text-xs`}>{e.reason ?? ""}</td></tr>)}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
