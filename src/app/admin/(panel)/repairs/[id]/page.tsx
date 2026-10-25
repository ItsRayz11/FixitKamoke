import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { Banner, Card, Field, fmtDate, inputCls, Submit } from "@/components/admin/ui";
import { KeepForm } from "@/components/admin/keep-form";
import { REPAIR_LABEL, nextRepairStatuses, type RepairStatus } from "@/lib/domain/repair-state";
import { updateRepairAction } from "../actions";

export const dynamic = "force-dynamic";

interface R {
  id: string; reference: string; status: RepairStatus; customer_name: string; phone: string; email: string | null; device_brand: string; device_model: string; issue: string;
  preferred_contact: string; appointment_preference: string | null; estimate_amount: number | null; estimate_is_confirmed: boolean; staff_notes: string | null;
  customer_message: string | null; created_at: string;
}

export default async function RepairAdmin({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireAdmin("staff");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await getDb();
  const r = (await db.query<R>("select * from repair_inquiries where id = $1", [id]))[0];
  if (!r) notFound();
  const history = await db.query<{ to_status: string; actor: string; note: string | null; created_at: string }>("select to_status, actor, note, created_at from repair_status_history where repair_id = $1 order by created_at, id", [id]);
  const next = nextRepairStatuses(r.status);
  return (
    <div className="max-w-3xl">
      <p className="text-sm"><Link href="/admin/repairs" className="text-accent">← All repair requests</Link></p>
      <h1 className="mt-2 text-2xl font-extrabold">{r.reference} <span className="ml-2 text-base font-semibold text-accent">{REPAIR_LABEL[r.status]}</span></h1>
      <div className="mt-3"><Banner ok={sp.ok} error={sp.error} /></div>

      <Card title="Request" id="req">
        <p className="mt-2 text-sm"><strong>{r.device_brand} {r.device_model}</strong></p>
        <p className="mt-1 whitespace-pre-wrap text-sm">{r.issue}</p>
        <p className="mt-3 text-sm">{r.customer_name} · {r.phone} · <a className="text-accent underline" href={`https://wa.me/${r.phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>{r.email && <> · {r.email}</>}</p>
        <p className="text-sm text-muted">Prefers: {r.preferred_contact}{r.appointment_preference && <> · Visit: {r.appointment_preference}</>} · Received {fmtDate(r.created_at)}</p>
      </Card>

      <div className="mt-4"><Card title="Update" id="upd">
        <KeepForm action={updateRepairAction} className="mt-3 grid gap-4">
          <input type="hidden" name="id" value={r.id} />
          <Field label="Status" id="to">
            <select id="to" name="to" defaultValue={r.status} className={inputCls}>
              <option value={r.status}>{REPAIR_LABEL[r.status]} (current)</option>
              {next.map((s) => <option key={s} value={s}>{REPAIR_LABEL[s]}</option>)}
            </select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Price (Rs.)" id="estimateAmount" hint="Leave empty if there is no price yet."><input id="estimateAmount" name="estimateAmount" inputMode="numeric" defaultValue={r.estimate_amount ?? ""} className={inputCls} /></Field>
            <label className="flex min-h-11 items-center gap-3 self-end text-sm font-semibold"><input type="checkbox" name="estimateIsConfirmed" defaultChecked={r.estimate_is_confirmed} className="h-5 w-5" /> This is the confirmed price (not just an estimate)</label>
          </div>
          <Field label="Message shown to the customer" id="customerMessage" hint="They see this on their status page. Keep it factual."><textarea id="customerMessage" name="customerMessage" rows={2} defaultValue={r.customer_message ?? ""} className={`${inputCls} h-auto py-2`} /></Field>
          <Field label="Internal notes" id="staffNotes" hint="Never shown to the customer."><textarea id="staffNotes" name="staffNotes" rows={2} defaultValue={r.staff_notes ?? ""} className={`${inputCls} h-auto py-2`} /></Field>
          <Field label="Note for the history (optional)" id="note"><input id="note" name="note" maxLength={300} className={inputCls} /></Field>
          <div><Submit>Save changes</Submit></div>
        </KeepForm>
      </Card></div>

      <div className="mt-4"><Card title="History" id="hist">
        <ol className="mt-2 space-y-1 text-sm">
          {history.map((h, i) => <li key={i}><strong>{REPAIR_LABEL[h.to_status as RepairStatus] ?? h.to_status}</strong> · {fmtDate(h.created_at)} · {h.actor}{h.note && <> — {h.note}</>}</li>)}
        </ol>
      </Card></div>
    </div>
  );
}
