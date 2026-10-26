import { displayName } from "@/lib/domain/display";
import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { Banner, fmtDate } from "@/components/admin/ui";
import { moderateReviewAction } from "../settings-actions";

export const dynamic = "force-dynamic";

export default async function ReviewsAdmin({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireAdmin("manager");
  const sp = await searchParams;
  const rows = await (await getDb()).query<{ id: string; author_name: string; rating: number; body: string; status: string; created_at: string; product: string; variant_label: string | null }>(
    "select r.id, r.author_name, r.rating, r.body, r.status, r.created_at, p.name as product, p.variant_label from reviews r join products p on p.id = r.product_id order by (r.status = 'pending') desc, r.created_at desc limit 200");
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-extrabold">Review moderation</h1>
      <p className="mt-1 text-sm text-muted">Only reviews from customers with a delivered order for that product can be submitted. Approve genuine reviews only; nothing here is shown publicly until approved.</p>
      <div className="mt-4"><Banner ok={sp.ok} error={sp.error} /></div>
      {rows.length === 0 && <p className="rounded-[var(--radius-md)] border border-dashed border-line bg-surface p-8 text-center text-muted">No reviews yet.</p>}
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.id} className="rounded-[var(--radius-md)] border border-line bg-surface p-4">
            <p className="text-sm"><strong>{r.author_name}</strong> on <em>{displayName(r.product, r.variant_label)}</em> · {"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)} · {fmtDate(r.created_at)} · <span className="font-semibold">{r.status}</span></p>
            <p className="mt-2 whitespace-pre-wrap text-sm">{r.body}</p>
            {r.status === "pending" && (
              <div className="mt-3 flex gap-3">
                {(["approved", "rejected"] as const).map((s) => (
                  <form key={s} action={moderateReviewAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="status" value={s} />
                    <button className={`min-h-11 rounded-[var(--radius-sm)] px-4 text-sm font-semibold text-white ${s === "approved" ? "bg-ok" : "bg-danger"}`}>{s === "approved" ? "Approve" : "Reject"}</button></form>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
