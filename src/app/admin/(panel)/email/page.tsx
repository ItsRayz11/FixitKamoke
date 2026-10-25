import { requireAdmin, assertAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { emailConfig } from "@/lib/email/outbox";
import { runOutbox } from "@/lib/email/run";
import { audit } from "@/lib/audit";
import { flash } from "@/lib/admin/flash";
import { Banner, Card, fmtDate, Submit, td, th } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

async function sendNow() {
  "use server";
  const admin = await assertAdmin("owner");
  const r = await runOutbox();
  await audit(admin.email, "email_send_now", "notification_outbox", null, { ...r });
  if (!r.configured) flash("/admin/email", { error: "Email is not configured, so nothing was sent. See the setup notes on this page." });
  flash("/admin/email", { ok: `Sent ${r.sent}, failed ${r.failed}, expired ${r.expired}.` });
}

async function retryFailed() {
  "use server";
  const admin = await assertAdmin("owner");
  const r = await (await getDb()).query("update notification_outbox set status = 'pending', attempts = 0, last_error = null where status = 'failed' and created_at > now() - interval '7 days' returning id");
  await audit(admin.email, "email_retry_failed", "notification_outbox", null, { count: r.length });
  flash("/admin/email", { ok: `Requeued ${r.length} message${r.length === 1 ? "" : "s"}.` });
}

export default async function EmailAdmin({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireAdmin("owner");
  const sp = await searchParams;
  const db = await getDb();
  const cfg = emailConfig();
  const counts = await db.query<{ status: string; n: number }>("select status, count(*)::int as n from notification_outbox group by status");
  const c = Object.fromEntries(counts.map((x) => [x.status, x.n])) as Record<string, number>;
  const recent = await db.query<{ id: string; kind: string; recipient: string; status: string; attempts: number; last_error: string | null; created_at: string }>(
    "select id, kind, recipient, status, attempts, last_error, created_at from notification_outbox order by created_at desc limit 40");
  const mask = (e: string) => e.replace(/^(.).*(@.*)$/, "$1***$2");
  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-extrabold">Email status</h1>
      <div className="mt-4"><Banner ok={sp.ok} error={sp.error} /></div>
      <Card title="Delivery setup" id="setup">
        {cfg ? (
          <p className="mt-2 text-sm text-ok">Resend is configured. Sending from <strong>{cfg.from}</strong>.</p>
        ) : (
          <div className="mt-2 space-y-2 text-sm">
            <p role="alert" className="font-semibold text-warn">Email is not configured. Customers are not being emailed. Orders and repairs still work normally and the messages wait in the queue below.</p>
            <ol className="list-decimal space-y-1 pl-5 text-muted">
              <li>Create a Resend account and verify your sending domain.</li>
              <li>Set <code>RESEND_API_KEY</code> and <code>EMAIL_FROM</code> (for example <code>Fixit &lt;orders@yourdomain.com&gt;</code>) on the server.</li>
              <li>Optionally set <code>CRON_SECRET</code> and schedule <code>/api/cron/email</code> so queued messages are sent even if nobody visits.</li>
            </ol>
          </div>
        )}
        <p className="mt-3 text-sm text-muted">Queue: {c.pending ?? 0} waiting · {c.sent ?? 0} sent · {c.failed ?? 0} failed. Messages not sent within 7 days are dropped, so a customer never gets an old status email.</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <form action={sendNow}><Submit>Send queued emails now</Submit></form>
          <form action={retryFailed}><button className="min-h-11 rounded-[var(--radius-sm)] border border-line bg-surface px-5 text-sm font-semibold">Retry failed</button></form>
        </div>
      </Card>
      <div className="mt-4 overflow-x-auto rounded-[var(--radius-md)] border border-line bg-surface">
        <table className="w-full">
          <thead className="border-b border-line"><tr><th className={th}>When</th><th className={th}>Type</th><th className={th}>To</th><th className={th}>Status</th><th className={th}>Tries</th><th className={th}>Last error</th></tr></thead>
          <tbody className="divide-y divide-line">
            {recent.length === 0 && <tr><td className={td} colSpan={6}>No emails queued yet.</td></tr>}
            {recent.map((r) => <tr key={r.id}><td className={td}>{fmtDate(r.created_at)}</td><td className={td}>{r.kind.replace(/_/g, " ")}</td><td className={td}>{mask(r.recipient)}</td><td className={td}>{r.status}</td><td className={td}>{r.attempts}</td><td className={`${td} max-w-xs break-words text-xs`}>{r.last_error ?? ""}</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
