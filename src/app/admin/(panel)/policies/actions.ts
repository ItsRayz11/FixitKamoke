"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { assertAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { flash } from "@/lib/admin/flash";

const schema = z.object({
  id: z.string().uuid().optional(),
  kind: z.enum(["return", "warranty"]),
  name: z.string().trim().min(2, "Give the policy a name (at least 2 letters).").max(80, "The name can be at most 80 characters."),
  summary: z.string().trim().max(200, "The short line can be at most 200 characters."),
  body: z.string().trim().min(1, "Write the policy text.").max(6000, "The policy text can be at most 6000 characters."),
  isDefault: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(9999),
});

export async function savePolicyAction(form: FormData) {
  const admin = await assertAdmin("manager");
  const p = schema.safeParse({
    id: form.get("id") || undefined, kind: form.get("kind"), name: form.get("name"), summary: form.get("summary") ?? "", body: form.get("body") ?? "",
    isDefault: form.get("isDefault") === "on", sortOrder: form.get("sortOrder") || 0,
  });
  if (!p.success) flash("/admin/policies", { error: p.error.issues[0].message });
  const d = p.data!;
  const db = await getDb();
  try {
    await db.tx(async (q) => {
      if (d.isDefault) await q.query("update product_policies set is_default = false where kind = $1 and ($2::uuid is null or id <> $2)", [d.kind, d.id ?? null]);
      if (d.id) {
        const r = await q.query("update product_policies set name=$2, summary=$3, body=$4, is_default=$5, sort_order=$6, updated_at=now() where id=$1 and kind=$7 returning id", [d.id, d.name, d.summary || null, d.body, d.isDefault, d.sortOrder, d.kind]);
        if (r.length === 0) throw new Error("Policy not found");
      } else {
        await q.query("insert into product_policies(kind, name, summary, body, is_default, sort_order) values ($1,$2,$3,$4,$5,$6)", [d.kind, d.name, d.summary || null, d.body, d.isDefault, d.sortOrder]);
      }
    });
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    flash("/admin/policies", { error: /duplicate key/.test(m) ? "You already have a policy with that name." : m === "Policy not found" ? m : "Could not save the policy." });
  }
  await audit(admin.email, d.id ? "policy_updated" : "policy_created", "policy", d.id ?? null, { kind: d.kind, name: d.name, isDefault: d.isDefault });
  revalidatePath("/policies/returns"); revalidatePath("/policies/warranty");
  flash("/admin/policies", { ok: `${d.kind === "return" ? "Return" : "Warranty"} policy saved.` });
}

export async function deletePolicyAction(form: FormData) {
  const admin = await assertAdmin("manager");
  const id = z.string().uuid().safeParse(form.get("id"));
  if (!id.success) flash("/admin/policies", { error: "Policy not found." });
  const db = await getDb();
  const gone = await db.query<{ name: string; kind: string }>("delete from product_policies where id = $1 returning name, kind", [id.data!]);
  if (gone.length === 0) flash("/admin/policies", { error: "Policy not found." });
  await audit(admin.email, "policy_deleted", "policy", id.data!, { name: gone[0].name, kind: gone[0].kind });
  flash("/admin/policies", { ok: `“${gone[0].name}” deleted. Products that used it now show the default policy, if you have one.` });
}
