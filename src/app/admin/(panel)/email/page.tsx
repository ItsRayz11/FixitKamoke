import { requireAdmin, assertAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { emailConfig, resendSender } from "@/lib/email/outbox";
import { runOutbox } from "@/lib/email/run";
import { connectionState, getLastTest, maskEmail, runEmailTest, type EmailConnection } from "@/lib/email/status";
import { audit } from "@/lib/audit";
import { flash } from "@/lib/admin/flash";
import { Banner, fmtDate, inputCls, Submit, td, th } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

async function sendNow() {
  "use server";
  const admin = await assertAdmin("owner");
  const r = await runOutbox();
  await audit(admin.email, "email_send_now", "notification_outbox", null, { ...r });
  if (!r.configured) flash("/admin/email", { error: "Email is not set up, so nothing was sent." });
  flash("/admin/email", { ok: `Sent ${r.sent}, failed ${r.failed}, expired ${r.expired}, skipped ${r.skipped}.` });
}

async function retryFailed() {
  "use server";
  const admin = await assertAdmin("owner");
  // Only messages from the last 7 days are retried: an old status email must never reach a customer late.
  const r = await (await getDb()).query("update notification_outbox set status = 'pending', attempts = 0, last_error = null where status = 'failed' and created_at > now() - interval '7 days' and last_error not like 'not sent:%' and last_error <> 'expired before it could be sent' returning id");
  await audit(admin.email, "email_retry_failed", "notification_outbox", null, { count: r.length });
  flash("/admin/email", { ok: `Requeued ${r.length} message${r.length === 1 ? "" : "s"}.` });
}

async function sendTest(form: FormData) {
  "use server";
  const admin = await assertAdmin("owner");
  const cfg = emailConfig();
  const rec = await runEmailTest(await getDb(), cfg, cfg ? resendSender(cfg) : null, String(form.get("to") ?? admin.email));
  await audit(admin.email, "email_test", "email", null, { ok: rec.ok });
  if (!rec.ok) flash("/admin/email", { error: `Test failed: ${rec.error}` });
  flash("/admin/email", { ok: `Test email accepted for delivery to ${rec.to}. Check that inbox (and spam) to confirm it arrived.` });
}

const CONN: Record<EmailConnection, { label: string; tone: string; line: string }> = {
  connected: { label: "Connected", tone: "bg-emerald-50 text-ok", line: "A test message was accepted by the email provider." },
  untested: { label: "Not tested", tone: "bg-amber-50 text-warn", line: "Settings are on the server. Send a test to prove it works." },
  error: { label: "Error", tone: "bg-red-50 text-danger", line: "The last test failed. See details below." },
  setup_required: { label: "Setup required", tone: "bg-amber-50 text-warn", line: "Emails wait in the queue until this is set up." },
};

function Tile({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="min-w-0 rounded-[var(--radius-md)] border border-line bg-surface p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-1 inline-block rounded-full px-0 text-xl font-extrabold ${tone ?? ""}`}>{value}</p>
    </div>
  );
}

export default async function EmailAdmin({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const admin = await requireAdmin("owner");
  const sp = await searchParams;
  const db = await getDb();
  const cfg = emailConfig();
  const last = await getLastTest(db);
  const conn = connectionState(cfg, last);
  const counts = await db.query<{ status: string; n: number }>("select status, count(*)::int as n from notification_outbox group by status");
  const c = Object.fromEntries(counts.map((x) => [x.status, x.n])) as Record<string, number>;
  const recent = await db.query<{ id: string; kind: string; recipient: string; status: string; attempts: number; last_error: string | null; created_at: string }>(
    "select id, kind, recipient, status, attempts, last_error, created_at from notification_outbox order by created_at desc limit 40");
  const cronSet = Boolean(process.env.CRON_SECRET && process.env.CRON_SECRET.length >= 16);
  const steps: { done: boolean; text: string }[] = [
    { done: Boolean(process.env.RESEND_API_KEY?.trim()), text: "Email provider key is on the server" },
    { done: Boolean(process.env.EMAIL_FROM?.trim()), text: "Sender address is set" },
    { done: last?.ok === true, text: "A test email was accepted by the provider" },
    { done: cronSet, text: "Scheduled sending is on (optional)" },
  ];

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold">Email</h1>
        <p className="mt-1 text-sm text-muted">Order and repair messages to customers.</p>
      </div>
      <Banner ok={sp.ok} error={sp.error} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="email-overview">
        <div className="min-w-0 rounded-[var(--radius-md)] border border-line bg-surface p-4">
          <p className="text-sm text-muted">Connection</p>
          <p className={`mt-1 inline-block rounded-full px-3 py-1 text-sm font-bold ${CONN[conn].tone}`} data-testid="email-connection">{CONN[conn].label}</p>
        </div>
        <Tile label="Sender" value={cfg ? (last?.ok ? "Verified by test" : "Not verified") : "Not set"} />
        <Tile label="Waiting to send" value={c.pending ?? 0} />
        <Tile label="Sent / failed" value={`${c.sent ?? 0} / ${c.failed ?? 0}`} />
      </div>
      <p className="text-sm text-muted">{CONN[conn].line}</p>

      <div className="flex flex-wrap items-end gap-3 rounded-[var(--radius-md)] border border-line bg-surface p-4">
        <form action={sendTest} className="flex min-w-0 flex-wrap items-end gap-2">
          <div className="min-w-0"><label htmlFor="to" className="text-sm font-semibold">Send a test email to</label><input id="to" name="to" type="email" required defaultValue={admin.email} className={`${inputCls} w-64 max-w-full`} /></div>
          <Submit>Send test email</Submit>
        </form>
        <form action={sendNow}><button className="min-h-11 rounded-[var(--radius-sm)] border border-line bg-surface px-5 text-sm font-semibold">Send waiting emails</button></form>
        <form action={retryFailed}><button className="min-h-11 rounded-[var(--radius-sm)] border border-line bg-surface px-5 text-sm font-semibold">Retry failed</button></form>
        <a href="#queue" className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-accent underline">View queue</a>
      </div>

      <section aria-labelledby="setup-h" className="rounded-[var(--radius-md)] border border-line bg-surface p-4">
        <h2 id="setup-h" className="font-bold">Setup checklist</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {steps.map((s) => <li key={s.text} className={s.done ? "text-ok" : "text-muted"}><span aria-hidden="true">{s.done ? "✓" : "○"}</span> <span className="sr-only">{s.done ? "Done: " : "Not done: "}</span>{s.text}</li>)}
        </ul>
        <details className="mt-3 text-sm text-muted"><summary className="cursor-pointer font-semibold text-ink">How to set it up</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Create a Resend account and verify your sending domain.</li>
            <li>On your host, set <code>RESEND_API_KEY</code> and <code>EMAIL_FROM</code> (for example <code>Fixit &lt;orders@yourdomain.com&gt;</code>), then redeploy.</li>
            <li>Come back here and press <strong>Send test email</strong>. The Connection tile turns green only if the provider accepts it.</li>
            <li>Optional: set <code>CRON_SECRET</code> and schedule <code>/api/cron/email</code> so waiting emails go out even when nobody visits.</li>
          </ol>
        </details>
        <details className="mt-2 text-sm text-muted"><summary className="cursor-pointer font-semibold text-ink">Technical details</summary>
          <p className="mt-2">Sender: {cfg ? cfg.from : "not set"}.</p>
          {last && <p className="mt-1">Last test: {fmtDate(last.at)} to {last.to || "n/a"}: {last.ok ? "accepted" : `failed (${last.error})`}.</p>}
          <p className="mt-1">Messages not sent within 7 days are dropped (password resets within 1 hour), and an order email is skipped if the order changed since it was queued, so a customer never receives a message that is no longer true.</p>
        </details>
      </section>

      <section id="queue" aria-labelledby="queue-h">
        <h2 id="queue-h" className="mb-2 font-bold">Queue and log</h2>
        <div className="overflow-x-auto rounded-[var(--radius-md)] border border-line bg-surface">
          <table className="w-full">
            <thead className="border-b border-line"><tr><th className={th}>When</th><th className={th}>Type</th><th className={th}>To</th><th className={th}>Status</th><th className={th}>Tries</th><th className={th}>Note</th></tr></thead>
            <tbody className="divide-y divide-line">
              {recent.length === 0 && <tr><td className={td} colSpan={6}>No emails queued yet.</td></tr>}
              {recent.map((r) => <tr key={r.id}><td className={td}>{fmtDate(r.created_at)}</td><td className={td}>{r.kind.replace(/_/g, " ")}</td><td className={td}>{maskEmail(r.recipient)}</td><td className={td}>{r.status}</td><td className={td}>{r.attempts}</td><td className={`${td} max-w-xs break-words text-xs`}>{r.last_error ?? ""}</td></tr>)}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
