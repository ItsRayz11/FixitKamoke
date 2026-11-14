import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { listPolicies, type PolicyKind, type ProductPolicy } from "@/lib/policies";
import { Banner, Field, inputCls, Submit } from "@/components/admin/ui";
import { MarkdownField } from "@/components/admin/markdown-field";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { deletePolicyAction, savePolicyAction } from "./actions";

export const dynamic = "force-dynamic";

const COPY: Record<PolicyKind, { title: string; one: string; help: string; example: string }> = {
  return: { title: "Return policies", one: "return policy", help: "Make as many as you need (for example “7-day return”, “No return, check on delivery”). Choose one on each product.", example: "7-day return" },
  warranty: { title: "Warranty policies", one: "warranty policy", help: "Make as many as you need (for example “6-month shop warranty”, “No warranty, check on the spot”). Choose one on each product.", example: "6-month warranty" },
};

function PolicyForm({ kind, p, used }: { kind: PolicyKind; p?: ProductPolicy; used?: number }) {
  const key = p?.id ?? `new-${kind}`;
  return (
    <form action={savePolicyAction} className="space-y-3">
      {p && <input type="hidden" name="id" value={p.id} />}
      <input type="hidden" name="kind" value={kind} />
      <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] [&>*]:min-w-0">
        <Field label="Name" id={`n-${key}`} hint={`Only you see this name, for example “${COPY[kind].example}”.`}><input id={`n-${key}`} name="name" required minLength={2} maxLength={80} defaultValue={p?.name ?? ""} className={inputCls} /></Field>
        <Field label="Order in lists" id={`o-${key}`} hint="Smaller comes first."><input id={`o-${key}`} name="sortOrder" inputMode="numeric" defaultValue={p?.sortOrder ?? 0} className={inputCls} /></Field>
      </div>
      <Field label="Short line (optional)" id={`s-${key}`} hint="One sentence shown on the product page, for example “Return within 7 days if unused.”"><input id={`s-${key}`} name="summary" maxLength={200} defaultValue={p?.summary ?? ""} className={inputCls} /></Field>
      <MarkdownField id={`b-${key}`} name="body" label="Full policy text" rows={7} maxLength={6000} required defaultValue={p?.body ?? ""} />
      <label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input type="checkbox" name="isDefault" defaultChecked={p?.isDefault ?? false} className="h-5 w-5" /> Use as the default for products that have not chosen one</label>
      <div className="flex flex-wrap items-center gap-3">
        <Submit>{p ? "Save changes" : `Add ${COPY[kind].one}`}</Submit>
        {p && <span className="text-xs text-muted">Used by {used ?? 0} product{used === 1 ? "" : "s"}.</span>}
      </div>
    </form>
  );
}

export default async function PoliciesAdmin({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireAdmin("manager");
  const sp = await searchParams;
  const [all, usage] = await Promise.all([
    listPolicies(),
    (await getDb()).query<{ id: string; n: number }>(
      "select pp.id, (select count(*)::int from products p where p.return_policy_id = pp.id or p.warranty_policy_id = pp.id) as n from product_policies pp"),
  ]);
  const used = new Map(usage.map((u) => [u.id, u.n]));
  return (
    <div className="max-w-4xl pb-16">
      <h1 className="text-2xl font-extrabold">Return and warranty policies</h1>
      <p className="mt-1 text-sm text-muted">Write your policies here, then choose which one applies on each product (Inventory tab). Customers see the chosen policy on the product page and on the Returns and Warranty pages.</p>
      <div className="mt-4"><Banner ok={sp.ok} error={sp.error} /></div>

      {(["return", "warranty"] as const).map((kind) => {
        const list = all.filter((p) => p.kind === kind);
        return (
          <section key={kind} aria-labelledby={`h-${kind}`} className="mt-8">
            <h2 id={`h-${kind}`} className="text-xl font-bold">{COPY[kind].title}</h2>
            <p className="mt-1 text-sm text-muted">{COPY[kind].help}</p>
            <div className="mt-3 space-y-3">
              {list.length === 0 && <p className="rounded-[var(--radius-md)] border border-line bg-surface p-4 text-sm text-muted">No {COPY[kind].one} yet. Add your first one below.</p>}
              {list.map((p) => (
                <details key={p.id} className="rounded-[var(--radius-md)] border border-line bg-surface">
                  <summary className="flex min-h-12 cursor-pointer flex-wrap items-center gap-2 px-4 py-2 font-semibold">
                    {p.name}
                    {p.isDefault && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-ok">Default</span>}
                    <span className="text-xs font-normal text-muted">{used.get(p.id) ?? 0} product(s)</span>
                  </summary>
                  <div className="space-y-3 border-t border-line p-4">
                    <PolicyForm kind={kind} p={p} used={used.get(p.id) ?? 0} />
                    <ConfirmButton action={deletePolicyAction} fields={{ id: p.id }} title={`Delete “${p.name}”?`} description="Products that chose this policy will use the default one instead. This cannot be undone." confirmLabel="Delete policy" className="min-h-11 rounded-[var(--radius-sm)] bg-danger px-5 text-sm font-semibold text-white">Delete policy</ConfirmButton>
                  </div>
                </details>
              ))}
            </div>
            <div className="mt-4 rounded-[var(--radius-md)] border border-line bg-surface p-4">
              <h3 className="font-bold">Add a {COPY[kind].one}</h3>
              <div className="mt-3"><PolicyForm kind={kind} /></div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
