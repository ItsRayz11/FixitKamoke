"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { assertAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { flash } from "@/lib/admin/flash";
import { saveStore, storeSettingsSchema, type StoreSettings } from "@/lib/settings";
import { hashPassword, passwordProblem } from "@/lib/auth/password";
import type { ShippingConfig } from "@/lib/domain/shipping";

const blank = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v === "" ? null : v;
};

export async function saveStoreAction(form: FormData) {
  const admin = await assertAdmin("owner");
  const wa = blank(form, "whatsappNumber")?.replace(/[\s+\-()]/g, "") ?? null;
  const p = storeSettingsSchema.safeParse({
    whatsappNumber: wa, address: blank(form, "address"), mapsUrl: blank(form, "mapsUrl"), mapsEmbedUrl: blank(form, "mapsEmbedUrl"),
    openingHours: blank(form, "openingHours"), contactEmail: blank(form, "contactEmail"), facebook: blank(form, "facebook"), instagram: blank(form, "instagram"),
    tiktok: blank(form, "tiktok"), youtube: blank(form, "youtube"), showFounder: form.get("showFounder") === "on", founderMessage: blank(form, "founderMessage"),
    founderPhotoUrl: blank(form, "founderPhotoUrl"), bankName: blank(form, "bankName"), bankAccountTitle: blank(form, "bankAccountTitle"),
    bankAccountNumber: blank(form, "bankAccountNumber"), heroTitle: blank(form, "heroTitle"), heroSubtitle: blank(form, "heroSubtitle"),
    announcement: blank(form, "announcement"), policiesApproved: form.get("policiesApproved") === "on",
    codEnabled: form.get("codEnabled") === "on", bankTransferEnabled: form.get("bankTransferEnabled") === "on",
    shippingTerms: blank(form, "shippingTerms"), returnsTerms: blank(form, "returnsTerms"), warrantyTerms: blank(form, "warrantyTerms"),
    repairServices: String(form.get("repairServices") ?? "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean),
  });
  if (!p.success) {
    const i = p.error.issues[0];
    flash("/admin/settings", { error: `${String(i.path[0] ?? "Setting")}: ${i.message}` });
  }
  const data = p.data as StoreSettings;
  await saveStore(data);
  await audit(admin.email, "store_settings_updated", "settings", "store", { policiesApproved: data.policiesApproved, whatsappSet: !!data.whatsappNumber });
  revalidatePath("/", "layout");
  flash("/admin/settings", { ok: "Store settings saved." });
}

const zoneSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().trim().min(1).max(60),
  cities: z.array(z.string().trim().min(1).max(60)).min(1, "Each zone needs at least one city").max(200),
  fee: z.number().int().min(0).max(100_000),
  freeThreshold: z.number().int().min(1).nullable(),
  codAvailable: z.boolean(),
  etaDays: z.tuple([z.number().int().min(0).max(60), z.number().int().min(0).max(60)]).nullable(),
});

export async function saveShippingAction(form: FormData) {
  const admin = await assertAdmin("manager");
  const zones: unknown[] = [];
  const rows = Number(form.get("rows") ?? 0);
  for (let i = 0; i < Math.min(rows, 30); i++) {
    const label = String(form.get(`z${i}_label`) ?? "").trim();
    if (!label) continue; // clearing the name deletes the zone
    const toInt = (k: string) => { const v = String(form.get(k) ?? "").trim(); return v === "" ? null : Number(v); };
    const etaMin = toInt(`z${i}_etaMin`), etaMax = toInt(`z${i}_etaMax`);
    zones.push({
      id: String(form.get(`z${i}_id`) || "") || `zone-${Date.now().toString(36)}-${i}`,
      label,
      cities: String(form.get(`z${i}_cities`) ?? "").split(/[\n,]/).map((c) => c.trim()).filter(Boolean),
      fee: toInt(`z${i}_fee`) ?? NaN,
      freeThreshold: toInt(`z${i}_free`),
      codAvailable: form.get(`z${i}_cod`) === "on",
      etaDays: etaMin !== null && etaMax !== null ? [etaMin, etaMax] : null,
    });
  }
  const parsed = z.array(zoneSchema).max(30).safeParse(zones);
  if (!parsed.success) flash("/admin/shipping", { error: `Check the delivery zones: ${parsed.error.issues[0].message}` });
  const unlisted = form.get("unlistedCity") === "not_serviceable" ? "not_serviceable" : "manual_confirmation";
  const config: ShippingConfig = { version: `v-${new Date().toISOString()}`, zones: parsed.data!, unlistedCity: unlisted };
  await (await getDb()).query(
    `insert into store_settings(key, value) values ('shipping', $1) on conflict (key) do update set value = excluded.value, updated_at = now()`, [JSON.stringify(config)]);
  await audit(admin.email, "shipping_config_updated", "settings", "shipping", { version: config.version, zones: config.zones.length, unlisted });
  flash("/admin/shipping", { ok: "Delivery settings saved. New orders use them immediately." });
}

const staffSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(2).max(80),
  role: z.enum(["manager", "staff"]),
  password: z.string(),
});

export async function createStaffAction(form: FormData) {
  const admin = await assertAdmin("owner");
  const p = staffSchema.safeParse({ email: form.get("email"), name: form.get("name"), role: form.get("role"), password: form.get("password") });
  if (!p.success) flash("/admin/users", { error: "Enter a valid name, email and role." });
  const problem = passwordProblem(p.data!.password);
  if (problem) flash("/admin/users", { error: problem });
  try {
    await (await getDb()).query("insert into admin_users(email, password_hash, role, display_name) values ($1,$2,$3,$4)", [p.data!.email, await hashPassword(p.data!.password), p.data!.role, p.data!.name]);
  } catch (e) {
    flash("/admin/users", { error: /duplicate key/.test(String(e)) ? "That email already has an account." : "Could not create the account." });
  }
  await audit(admin.email, "staff_created", "admin_user", null, { email: p.data!.email, role: p.data!.role });
  flash("/admin/users", { ok: "Staff account created. Share the password with them securely." });
}

export async function setStaffActiveAction(form: FormData) {
  const admin = await assertAdmin("owner");
  const id = String(form.get("id") ?? "");
  const active = form.get("active") === "1";
  if (id === admin.id) flash("/admin/users", { error: "You cannot deactivate your own account." });
  const db = await getDb();
  const r = await db.query<{ email: string; role: string }>("update admin_users set active = $2 where id = $1 and role <> 'owner' returning email, role", [id, active]);
  if (!r[0]) flash("/admin/users", { error: "Account not found, or it is an owner account." });
  if (!active) await db.query("delete from admin_sessions where user_id = $1", [id]);
  await audit(admin.email, active ? "staff_enabled" : "staff_disabled", "admin_user", id, { email: r[0].email });
  flash("/admin/users", { ok: active ? "Account enabled." : "Account disabled and signed out." });
}

export async function moderateReviewAction(form: FormData) {
  const admin = await assertAdmin("manager");
  const id = String(form.get("id") ?? "");
  const status = z.enum(["approved", "rejected"]).safeParse(form.get("status"));
  if (!status.success) flash("/admin/reviews", { error: "Invalid request." });
  await (await getDb()).query("update reviews set status = $2 where id = $1", [id, status.data]);
  await audit(admin.email, `review_${status.data}`, "review", id);
  flash("/admin/reviews", { ok: `Review ${status.data}.` });
}
