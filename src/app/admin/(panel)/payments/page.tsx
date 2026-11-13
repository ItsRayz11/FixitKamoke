import Link from "next/link";
import { site } from "@/config/site";
import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getStore } from "@/lib/settings";
import { gatewayStatuses, getPaymentOptions, type GatewayStatus } from "@/lib/payments";
import { Banner, fmtDate, inputCls, Submit, td, th } from "@/components/admin/ui";
import { formatPKR } from "@/lib/domain/money";
import { getAdvanceConfig } from "@/lib/payments/advance";
import { advanceFor, formatBps } from "@/lib/domain/advance";
import { saveAdvanceAction, saveBankAction, saveWalletAction, setGatewayModeAction, toggleMethodAction } from "./actions";

export const dynamic = "force-dynamic";

type Status = "Active" | "Off" | "Setup required" | "Testing" | "Error" | "Not available";
const TONE: Record<Status, string> = {
  Active: "bg-emerald-50 text-ok",
  Off: "bg-slate-100 text-muted",
  "Setup required": "bg-amber-50 text-warn",
  Testing: "bg-blue-50 text-accent",
  Error: "bg-red-50 text-danger",
  "Not available": "bg-slate-100 text-muted",
};

function Icon({ name }: { name: "cash" | "bank" | "wallet" | "card" }) {
  const common = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (name === "cash") return <svg {...common}><rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.6" /></svg>;
  if (name === "bank") return <svg {...common}><path d="M3 10 12 4l9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" /></svg>;
  if (name === "wallet") return <svg {...common}><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" /><rect x="3" y="8" width="18" height="11" rx="2" /><circle cx="16.5" cy="13.5" r="1" /></svg>;
  return <svg {...common}><rect x="2.5" y="5.5" width="19" height="13" rx="2" /><path d="M2.5 10h19" /></svg>;
}

function Card({ id, icon, name, status, line, children, toggle }: {
  id: string; icon: "cash" | "bank" | "wallet" | "card"; name: string; status: Status; line: string; children?: React.ReactNode;
  toggle?: { method: string; on: boolean; disabled?: boolean };
}) {
  return (
    <section aria-labelledby={`${id}-h`} id={id} className="flex min-w-0 flex-col rounded-[var(--radius-md)] border border-line bg-surface p-4" data-testid={`method-${id}`}>
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-blue-50 text-accent"><Icon name={icon} /></span>
        <div className="min-w-0 flex-1">
          <h2 id={`${id}-h`} className="font-bold">{name}</h2>
          <p className="mt-0.5 text-sm text-muted">{line}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${TONE[status]}`} data-testid={`status-${id}`}>{status}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {toggle && (
          <form action={toggleMethodAction}>
            <input type="hidden" name="method" value={toggle.method} /><input type="hidden" name="on" value={toggle.on ? "0" : "1"} />
            <button className={`min-h-11 rounded-[var(--radius-sm)] px-4 text-sm font-semibold ${toggle.on ? "border border-line bg-surface" : "bg-accent text-white hover:bg-accent-strong"}`}>{toggle.on ? "Turn off" : "Turn on"}</button>
          </form>
        )}
      </div>
      {children && <details className="group mt-3 border-t border-line pt-3"><summary className="cursor-pointer text-sm font-semibold text-accent">Configure</summary><div className="mt-3 min-w-0 space-y-3">{children}</div></details>}
    </section>
  );
}

function ModeButton({ id, mode, children, primary }: { id: string; mode: string; children: React.ReactNode; primary?: boolean }) {
  return (
    <form action={setGatewayModeAction}>
      <input type="hidden" name="id" value={id} /><input type="hidden" name="mode" value={mode} />
      <button className={`min-h-11 rounded-[var(--radius-sm)] px-4 text-sm font-semibold ${primary ? "bg-accent text-white hover:bg-accent-strong" : "border border-line bg-surface"}`}>{children}</button>
    </form>
  );
}

function gatewayStatus(g: GatewayStatus, lastRefused: boolean): { status: Status; line: string } {
  if (!g.implemented) return { status: "Not available", line: "Needs the provider's merchant guide before it can be built." };
  if (!g.credentialsPresent) return { status: "Setup required", line: "Merchant credentials are not on the server yet." };
  if (lastRefused) return { status: "Error", line: "The last message from the provider was refused. See the log below." };
  if (g.stage === "live") return { status: "Active", line: "Customers can pay online. Paid automatically when confirmed." };
  if (g.stage === "testing") return { status: "Testing", line: "Only signed-in staff see it at checkout. Make a test payment." };
  if (g.stage === "ready_to_go_live") return { status: "Testing", line: "Test payment confirmed. You can go live." };
  return { status: "Off", line: "Credentials are set. Start testing when ready." };
}

export default async function PaymentsAdmin({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireAdmin("owner");
  const sp = await searchParams;
  const db = await getDb();
  const [opts, store, gateways, adv] = await Promise.all([getPaymentOptions(db), getStore(), gatewayStatuses(db), getAdvanceConfig(db)]);
  const advChoice = !adv.enabled ? "none" : adv.mode === "fixed" ? "custom_fixed" : adv.bps === 3333 ? "third" : adv.bps === 5000 ? "half" : "custom_percent";
  const sample = advanceFor(3000, adv);
  const manualWaiting = (await db.query<{ n: number }>("select count(*)::int as n from orders where payment_method in ('bank_transfer','jazzcash_manual','easypaisa_manual') and payment_status in ('unpaid','pending') and status not in ('cancelled','rejected')"))[0]?.n ?? 0;
  const advanceWaiting = (await db.query<{ n: number }>("select count(*)::int as n from orders where payment_method = 'cod' and advance_required > advance_paid and status not in ('cancelled','rejected','returned')"))[0]?.n ?? 0;
  const awaiting = await db.query<{ id: string; order_number: string; total: number; created_at: string; provider: string | null }>(
    "select id, order_number, total, created_at, payment_provider as provider from orders where payment_method = 'online' and payment_status in ('pending','failed','unpaid') and status not in ('cancelled','rejected') order by created_at desc limit 20");
  const events = await db.query<{ provider: string; received_at: string; verified: boolean; outcome: string; reason: string | null; reference: string | null }>(
    "select provider, received_at, verified, outcome, reason, reference from payment_events order by received_at desc limit 25");
  const lastByProvider = new Map<string, boolean>();
  for (const e of [...events].reverse()) lastByProvider.set(e.provider, e.verified);
  const local = /localhost|127\.0\.0\.1/.test(site.baseUrl);

  const bankReady = Boolean(store.bankAccountNumber?.trim());
  const jazzOn = store.jazzcashEnabled === true;
  const easyOn = store.easypaisaEnabled === true;

  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold">Payments</h1>
        <p className="mt-1 text-sm text-muted">Choose how customers can pay.</p>
      </div>
      <Banner ok={sp.ok} error={sp.error} />
      {local && <p role="alert" className="rounded-[var(--radius-sm)] bg-amber-50 p-3 text-sm font-semibold text-warn">The site address is {site.baseUrl}. Set SITE_URL on your host so payment links and callbacks work.</p>}
      {(manualWaiting > 0 || advanceWaiting > 0) && (
        <p className="rounded-[var(--radius-sm)] border border-line bg-blue-50 p-3 text-sm" data-testid="waiting-note">
          <strong>Needs checking:</strong> {manualWaiting > 0 && <>{manualWaiting} transfer{manualWaiting === 1 ? "" : "s"}</>}{manualWaiting > 0 && advanceWaiting > 0 && " and "}{advanceWaiting > 0 && <>{advanceWaiting} COD advance{advanceWaiting === 1 ? "" : "s"}</>} waiting. <Link href="/admin/orders" className="font-semibold text-accent underline">Open orders</Link>
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card id="cod" icon="cash" name="Cash on delivery" status={opts.cod ? "Active" : "Off"} toggle={{ method: "cod", on: opts.cod }}
          line={!opts.cod ? "Customers cannot choose it." : adv.enabled ? (adv.mode === "fixed" ? `Advance ${formatPKR(adv.fixed)}, rest on delivery.` : `${formatBps(adv.bps)} advance, rest on delivery.`) : "Pay when the order arrives."}>
          <p className="text-sm font-semibold">Advance before confirming</p>
          <p className="text-sm text-muted">Now: <strong>{!adv.enabled ? "No advance" : adv.mode === "fixed" ? `Fixed ${formatPKR(adv.fixed)}` : `${formatBps(adv.bps)} of the total`}</strong>{adv.enabled && <> · Rs. 3,000 order: {formatPKR(sample.advance)} now, {formatPKR(sample.balance)} on delivery</>}</p>
          <form action={saveAdvanceAction} className="space-y-2">
            {([["none", "No advance (0%)"], ["third", "One-third (33.33%)"], ["half", "Half (50%)"], ["custom_percent", "Custom percentage"], ["custom_fixed", "Custom fixed amount"]] as const).map(([v, label]) => (
              <label key={v} className="flex min-h-11 items-center gap-3 text-sm"><input type="radio" name="choice" value={v} defaultChecked={advChoice === v} className="h-5 w-5" /> {label}</label>
            ))}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="min-w-0"><label htmlFor="percent" className="text-sm font-semibold">Percentage</label><input id="percent" name="percent" inputMode="decimal" defaultValue={advChoice === "custom_percent" ? String(adv.bps / 100) : ""} placeholder="e.g. 25" className={inputCls} /></div>
              <div className="min-w-0"><label htmlFor="fixed" className="text-sm font-semibold">Fixed (Rs.)</label><input id="fixed" name="fixed" inputMode="numeric" defaultValue={advChoice === "custom_fixed" ? String(adv.fixed) : ""} placeholder="e.g. 500" className={inputCls} /></div>
              <div className="min-w-0"><label htmlFor="minOrder" className="text-sm font-semibold">Orders of (Rs.) or more</label><input id="minOrder" name="minOrder" inputMode="numeric" defaultValue={adv.minOrder ? String(adv.minOrder) : ""} placeholder="empty = all" className={inputCls} /></div>
            </div>
            <Submit>Save advance rule</Submit>
          </form>
          <details className="text-sm text-muted"><summary className="cursor-pointer font-semibold text-ink">How it works</summary>
            <p className="mt-2">The advance is worked out on the final total, rounded up to the next rupee. Customers pay it by transfer and send the transaction ID. You check your bank or wallet app, then press <strong>Verify advance</strong> on the order. A new rule only affects new orders.</p>
          </details>
        </Card>

        <Card id="bank" icon="bank" name="Bank transfer" toggle={{ method: "bank", on: opts.bankTransfer }}
          status={!opts.bankTransfer ? "Off" : bankReady ? "Active" : "Setup required"}
          line={!opts.bankTransfer ? "Customers cannot choose it." : bankReady ? "Customers see your account after ordering." : "Add your account so customers know where to pay."}>
          <form action={saveBankAction} className="space-y-3">
            <div><label htmlFor="bankName" className="text-sm font-semibold">Bank name</label><input id="bankName" name="bankName" defaultValue={store.bankName ?? ""} maxLength={100} className={inputCls} /></div>
            <div><label htmlFor="bankAccountTitle" className="text-sm font-semibold">Account title</label><input id="bankAccountTitle" name="bankAccountTitle" defaultValue={store.bankAccountTitle ?? ""} maxLength={100} className={inputCls} /></div>
            <div><label htmlFor="bankAccountNumber" className="text-sm font-semibold">IBAN / account number</label><input id="bankAccountNumber" name="bankAccountNumber" defaultValue={store.bankAccountNumber ?? ""} maxLength={60} className={inputCls} /></div>
            <div><label htmlFor="paymentInstructions" className="text-sm font-semibold">Extra instructions</label><textarea id="paymentInstructions" name="paymentInstructions" rows={3} defaultValue={store.paymentInstructions ?? ""} maxLength={600} className={`${inputCls} h-auto py-2`} /></div>
            <Submit>Save bank details</Submit>
          </form>
          <p className="text-xs text-muted">Transfers are not detected automatically. You check the bank, then mark the order paid.</p>
        </Card>

        <Card id="jazzcash" icon="wallet" name="JazzCash transfer" toggle={{ method: "jazzcash", on: jazzOn }}
          status={!jazzOn ? (store.jazzcashNumber ? "Off" : "Setup required") : opts.wallets.includes("jazzcash_manual") ? "Active" : "Setup required"}
          line={jazzOn ? "Customers send to your wallet number." : store.jazzcashNumber ? "Saved but switched off." : "Add your wallet number to start."}>
          <WalletForm kind="jazzcash" title={store.jazzcashTitle} number={store.jazzcashNumber} />
        </Card>

        <Card id="easypaisa" icon="wallet" name="Easypaisa transfer" toggle={{ method: "easypaisa", on: easyOn }}
          status={!easyOn ? (store.easypaisaNumber ? "Off" : "Setup required") : opts.wallets.includes("easypaisa_manual") ? "Active" : "Setup required"}
          line={easyOn ? "Customers send to your wallet number." : store.easypaisaNumber ? "Saved but switched off." : "Add your wallet number to start."}>
          <WalletForm kind="easypaisa" title={store.easypaisaTitle} number={store.easypaisaNumber} />
        </Card>

        {gateways.map((g) => {
          const st = gatewayStatus(g, lastByProvider.get(g.id) === false);
          return (
            <Card key={g.id} id={`gw-${g.id}`} icon="card" name={g.id === "safepay" ? "Safepay (cards and wallets)" : g.id === "jazzcash" ? "JazzCash merchant (automatic)" : "Easypaisa merchant (automatic)"} status={st.status} line={st.line}>
              {g.implemented ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    {g.credentialsPresent && g.mode === "off" && <ModeButton id={g.id} mode="testing" primary>Start test</ModeButton>}
                    {g.mode === "testing" && <ModeButton id={g.id} mode="off">Switch off</ModeButton>}
                    {g.mode === "testing" && g.verified && <ModeButton id={g.id} mode="live" primary>Go live</ModeButton>}
                    {g.mode === "live" && <ModeButton id={g.id} mode="off">Switch off</ModeButton>}
                  </div>
                  <ol className="list-decimal space-y-1 pl-5 text-sm">
                    <li className={g.credentialsPresent ? "text-ok" : ""}>Credentials on the server: {g.credentialsPresent ? "saved" : "not saved yet"}</li>
                    <li className={g.mode !== "off" ? "text-ok" : ""}>Test mode: {g.mode === "off" ? "not started" : "started"}</li>
                    <li className={g.verified ? "text-ok" : ""}>Test payment confirmed by the provider: {g.verified ? "yes" : "not yet"}</li>
                    <li className={g.stage === "live" ? "text-ok" : ""}>Live for customers: {g.stage === "live" ? "yes" : "no"}</li>
                  </ol>
                  <details className="text-sm text-muted"><summary className="cursor-pointer font-semibold text-ink">Technical details</summary>
                    <p className="mt-2">{g.detection}</p>
                    <p className="mt-2">{g.notes}</p>
                    <p className="mt-2"><strong>Server settings:</strong> {g.requiredEnv.map((k) => <code key={k} className="mr-2 inline-block max-w-full break-all rounded bg-canvas px-1.5 py-0.5 text-xs">{k}</code>)}</p>
                    {g.callbackPath && <p className="mt-2"><strong>Give the provider this address:</strong> <code className="break-all rounded bg-canvas px-1.5 py-0.5 text-xs">{site.baseUrl}{g.callbackPath}</code></p>}
                  </details>
                </>
              ) : (
                <p className="text-sm text-muted">Easypaisa&apos;s automatic notification format is only given to merchants. Until then, use the Easypaisa transfer card above.</p>
              )}
            </Card>
          );
        })}
      </div>

      <details className="rounded-[var(--radius-md)] border border-line bg-surface p-4">
        <summary className="cursor-pointer font-bold">Diagnostics and logs</summary>
        <div className="mt-3 space-y-4">
          {awaiting.length > 0 && (
            <div>
              <h2 className="text-sm font-bold">Online orders waiting for payment</h2>
              <p className="mt-1 text-sm text-muted">Stock is held for these. Cancel an abandoned order to put the items back.</p>
              <ul className="mt-2 divide-y divide-line text-sm">
                {awaiting.map((o) => <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><Link className="font-semibold text-accent" href={`/admin/orders/${o.id}`}>{o.order_number}</Link><span>{formatPKR(o.total)} · {o.provider ?? "online"} · {fmtDate(o.created_at)}</span></li>)}
              </ul>
            </div>
          )}
          <div>
            <h2 className="text-sm font-bold">What the providers have sent us</h2>
            {events.length === 0 ? <p className="mt-2 text-sm text-muted">Nothing received yet.</p> : (
              <div className="mt-2 overflow-x-auto rounded-[var(--radius-md)] border border-line">
                <table className="w-full">
                  <thead className="border-b border-line"><tr><th className={th}>When</th><th className={th}>Provider</th><th className={th}>Signature</th><th className={th}>Result</th><th className={th}>Note</th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {events.map((e, i) => <tr key={i}><td className={td}>{fmtDate(e.received_at)}</td><td className={td}>{e.provider}</td><td className={td}>{e.verified ? "valid" : "REFUSED"}</td><td className={td}>{e.outcome.replace(/_/g, " ")}</td><td className={`${td} max-w-xs break-words text-xs`}>{e.reason ?? ""}</td></tr>)}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}

function WalletForm({ kind, title, number }: { kind: "jazzcash" | "easypaisa"; title?: string | null; number?: string | null }) {
  return (
    <form action={saveWalletAction} className="space-y-3">
      <input type="hidden" name="kind" value={kind} />
      <div><label htmlFor={`${kind}-title`} className="text-sm font-semibold">Account title</label><input id={`${kind}-title`} name="title" defaultValue={title ?? ""} maxLength={100} className={inputCls} /></div>
      <div><label htmlFor={`${kind}-number`} className="text-sm font-semibold">Wallet number</label><input id={`${kind}-number`} name="number" inputMode="tel" defaultValue={number ?? ""} placeholder="0300 1234567" maxLength={20} className={inputCls} /></div>
      <Submit>Save wallet</Submit>
      <p className="text-xs text-muted">Not detected automatically. You check the wallet app, then mark the order paid. Use a business wallet if you have one.</p>
    </form>
  );
}
