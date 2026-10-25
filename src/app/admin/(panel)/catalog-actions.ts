"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { assertAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { flash, slugify } from "@/lib/admin/flash";

const msg = (e: unknown) => (e instanceof Error ? e.message : "");
const dup = (e: unknown) => /duplicate key/.test(msg(e));

export async function saveCategoryAction(form: FormData) {
  const admin = await assertAdmin("manager");
  const p = z.object({ id: z.string().optional(), name: z.string().trim().min(2, "Name is required").max(80), slug: z.string().trim().max(80), description: z.string().trim().max(300), sortOrder: z.coerce.number().int().min(0).max(999) })
    .safeParse({ id: form.get("id") || undefined, name: form.get("name"), slug: form.get("slug") ?? "", description: form.get("description") ?? "", sortOrder: form.get("sortOrder") || 0 });
  if (!p.success) flash("/admin/categories", { error: p.error.issues[0].message });
  const d = p.data;
  const slug = slugify(d.slug || d.name);
  const db = await getDb();
  try {
    if (d.id) {
      await db.query("update categories set name=$2, slug=$3, description=$4, sort_order=$5 where id=$1", [d.id, d.name, slug, d.description || null, d.sortOrder]);
    } else {
      await db.query("insert into categories(name, slug, description, sort_order) values ($1,$2,$3,$4)", [d.name, slug, d.description || null, d.sortOrder]);
    }
  } catch (e) {
    flash("/admin/categories", { error: dup(e) ? "A category with that web address already exists." : "Could not save the category." });
  }
  await audit(admin.email, d.id ? "category_updated" : "category_created", "category", d.id ?? null, { name: d.name });
  revalidatePath("/shop"); revalidatePath("/");
  flash("/admin/categories", { ok: "Category saved." });
}

export async function deleteCategoryAction(form: FormData) {
  const admin = await assertAdmin("manager");
  const id = String(form.get("id") ?? "");
  const db = await getDb();
  const used = await db.query<{ n: number }>("select count(*)::int as n from products where category_id = $1", [id]);
  if ((used[0]?.n ?? 0) > 0) flash("/admin/categories", { error: `This category still has ${used[0].n} product(s). Move them first.` });
  await db.query("delete from categories where id = $1", [id]);
  await audit(admin.email, "category_deleted", "category", id);
  flash("/admin/categories", { ok: "Category deleted." });
}

const couponSchema = z.object({
  code: z.string().trim().min(3, "Code needs at least 3 characters").max(30).regex(/^[A-Za-z0-9_-]+$/, "Code can only use letters, numbers, - and _"),
  type: z.enum(["percent", "fixed"]),
  value: z.coerce.number().int().min(1, "Value must be at least 1"),
  minSubtotal: z.coerce.number().int().min(0),
  maxDiscount: z.string().trim().transform((v) => (v === "" ? null : Number(v))).pipe(z.union([z.null(), z.number().int().min(1)])),
  usageLimit: z.string().trim().transform((v) => (v === "" ? null : Number(v))).pipe(z.union([z.null(), z.number().int().min(1)])),
  expiresAt: z.string().trim().transform((v) => (v === "" ? null : new Date(v + "T23:59:59"))),
});

export async function saveCouponAction(form: FormData) {
  const admin = await assertAdmin("manager");
  const p = couponSchema.safeParse({
    code: form.get("code"), type: form.get("type"), value: form.get("value"), minSubtotal: form.get("minSubtotal") || 0,
    maxDiscount: form.get("maxDiscount") ?? "", usageLimit: form.get("usageLimit") ?? "", expiresAt: form.get("expiresAt") ?? "",
  });
  if (!p.success) flash("/admin/coupons", { error: p.error.issues[0].message });
  const d = p.data;
  if (d.type === "percent" && d.value > 90) flash("/admin/coupons", { error: "Percentage discounts are limited to 90%." });
  try {
    await (await getDb()).query(
      "insert into coupons(code, type, value, min_subtotal, max_discount, usage_limit, expires_at) values ($1,$2,$3,$4,$5,$6,$7)",
      [d.code.toUpperCase(), d.type, d.value, d.minSubtotal, d.maxDiscount, d.usageLimit, d.expiresAt],
    );
  } catch (e) {
    flash("/admin/coupons", { error: dup(e) ? "That coupon code already exists." : "Could not save the coupon." });
  }
  await audit(admin.email, "coupon_created", "coupon", null, { code: d.code.toUpperCase(), type: d.type, value: d.value });
  flash("/admin/coupons", { ok: "Coupon created." });
}

export async function toggleCouponAction(form: FormData) {
  const admin = await assertAdmin("manager");
  const id = String(form.get("id") ?? "");
  const rows = await (await getDb()).query<{ code: string; active: boolean }>("update coupons set active = not active where id = $1 returning code, active", [id]);
  if (rows[0]) await audit(admin.email, rows[0].active ? "coupon_enabled" : "coupon_disabled", "coupon", id, { code: rows[0].code });
  flash("/admin/coupons", { ok: rows[0] ? `Coupon ${rows[0].code} is now ${rows[0].active ? "active" : "disabled"}.` : "Coupon not found." });
}
