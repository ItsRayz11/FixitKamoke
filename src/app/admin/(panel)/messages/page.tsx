import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { assertAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { flash } from "@/lib/admin/flash";
import { Banner, fmtDate } from "@/components/admin/ui";

export const dynamic = "force-dynamic";

async function markHandled(form: FormData) {
  "use server";
  const admin = await assertAdmin("staff");
  const id = String(form.get("id") ?? "");
  await (await getDb()).query("update contact_messages set handled = not handled where id = $1", [id]);
  await audit(admin.email, "contact_message_toggled", "contact_message", id);
  flash("/admin/messages", { ok: "Updated." });
}

export default async function MessagesAdmin({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireAdmin("staff");
  const sp = await searchParams;
  const rows = await (await getDb()).query<{ id: string; name: string; phone: string | null; email: string | null; message: string; handled: boolean; created_at: string }>(
    "select id, name, phone, email, message, handled, created_at from contact_messages order by handled, created_at desc limit 200");
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-extrabold">Contact messages</h1>
      <div className="mt-4"><Banner ok={sp.ok} error={sp.error} /></div>
      {rows.length === 0 && <p className="rounded-[var(--radius-md)] border border-dashed border-line bg-surface p-8 text-center text-muted">No messages yet.</p>}
      <ul className="space-y-3">
        {rows.map((m) => (
          <li key={m.id} className={`rounded-[var(--radius-md)] border border-line bg-surface p-4 ${m.handled ? "opacity-60" : ""}`}>
            <p className="text-sm"><strong>{m.name}</strong> · {m.phone ?? "no phone"}{m.email && <> · {m.email}</>} · {fmtDate(m.created_at)}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm">{m.message}</p>
            <form action={markHandled} className="mt-3"><input type="hidden" name="id" value={m.id} /><button className="min-h-11 text-sm font-semibold text-accent underline">{m.handled ? "Mark as open" : "Mark as handled"}</button></form>
          </li>
        ))}
      </ul>
    </div>
  );
}
