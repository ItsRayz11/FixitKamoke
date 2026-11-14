"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { assertAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { flash } from "@/lib/admin/flash";
import { getAdvanceConfig, saveAdvanceConfig } from "@/lib/payments/advance";
import type { AdvanceConfig } from "@/lib/domain/advance";
import { getStore, saveStore } from "@/lib/settings";
import { leavesNoPaymentMethod, getPaymentOptions, credentialsPresent, GATEWAYS, getGatewaySettings, hasVerifiedPayment, type GatewayId, type GatewayMode } from "@/lib/payments";

/** Moves a gateway between off, testing (staff only) and live. Going live needs a verified, matched test payment first. */
export async function setGatewayModeAction(form: FormData) {
  const owner = await assertAdmin("owner");
  const id = String(form.get("id") ?? "") as GatewayId;
  const mode = String(form.get("mode") ?? "") as GatewayMode;
  const g = GATEWAYS.find((x) => x.id === id);
  if (!g || !["off", "testing", "live"].includes(mode)) flash("/admin/payments", { error: "Unknown gateway or mode." });
  const db = await getDb();
  if (mode !== "off") {
    if (!g!.implemented) flash("/admin/payments", { error: `${g!.name} is not built yet.` });
    if (!credentialsPresent(id)) flash("/admin/payments", { error: `${g!.name} credentials are not set on the server yet.` });
  }
  if (mode === "live" && !(await hasVerifiedPayment(db, id))) {
    flash("/admin/payments", { error: `Make a successful test payment first. ${g!.name} cannot go live until the provider has confirmed one to us with a valid signature.` });
  }
  const next = { ...(await getGatewaySettings(db)), [id]: { mode } };
  await db.query(
    `insert into store_settings(key, value) values ('gateways', $1)
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [JSON.stringify(next)],
  );
  await audit(owner.email, "gateway_mode_changed", "gateway", id, { mode });
  revalidatePath("/checkout");
  flash("/admin/payments", { ok: mode === "live" ? `${g!.name} is now live for customers.` : mode === "testing" ? `${g!.name} is in testing: only signed-in staff can see it at checkout.` : `${g!.name} is switched off.` });
}

/** Saves the cash-on-delivery advance rule. Only affects orders placed after saving; existing orders keep the advance they were created with. */
export async function saveAdvanceAction(form: FormData) {
  const owner = await assertAdmin("owner");
  const choice = String(form.get("choice") ?? "none");
  const int = (k: string) => { const v = String(form.get(k) ?? "").replace(/[, ]/g, "").trim(); return v === "" ? NaN : Number(v); };
  const rules = (await getAdvanceConfig(await getDb())).rules; // the general rule is saved here; exceptions are managed separately and kept
  let cfg: AdvanceConfig = { enabled: true, mode: "percent", bps: 3333, fixed: 500, minOrder: 0, rules };
  const minOrder = Number.isFinite(int("minOrder")) ? int("minOrder") : 0;
  if (!Number.isSafeInteger(minOrder) || minOrder < 0) flash("/admin/payments", { error: "Minimum order must be a whole number of rupees, or empty." });
  cfg.minOrder = minOrder;
  if (choice === "none") cfg = { ...cfg, enabled: false };
  else if (choice === "third") cfg.bps = 3333;
  else if (choice === "half") cfg.bps = 5000;
  else if (choice === "custom_percent") {
    const pct = Number(String(form.get("percent") ?? "").trim());
    const bps = Math.round(pct * 100);
    if (!Number.isFinite(pct) || bps < 100 || bps > 10_000) flash("/admin/payments", { error: "Enter a percentage between 1 and 100." });
    cfg.bps = bps;
  } else if (choice === "custom_fixed") {
    const fixed = int("fixed");
    if (!Number.isSafeInteger(fixed) || fixed < 1) flash("/admin/payments", { error: "Enter the advance amount in whole rupees." });
    cfg = { ...cfg, mode: "fixed", fixed };
  } else flash("/admin/payments", { error: "Choose one of the options." });
  await saveAdvanceConfig(await getDb(), cfg);
  await audit(owner.email, "cod_advance_changed", "settings", "cod_advance", { choice, enabled: cfg.enabled, mode: cfg.mode, bps: cfg.bps, fixed: cfg.fixed, minOrder: cfg.minOrder });
  revalidatePath("/checkout");
  flash("/admin/payments", { ok: cfg.enabled ? "Advance rule saved. It applies to new cash-on-delivery orders only." : "Advance turned off for new orders." });
}

/** Adds or replaces an exception to the advance rule for one product or one category. Only affects new orders. */
export async function saveAdvanceRuleAction(form: FormData) {
  const owner = await assertAdmin("owner");
  const target = String(form.get("target") ?? ""); // "product:<uuid>" or "category:<uuid>"
  const [kind, id] = target.split(":");
  const mode = String(form.get("mode") ?? "");
  const db = await getDb();
  if ((kind !== "product" && kind !== "category") || !/^[0-9a-f-]{36}$/i.test(id ?? "")) flash("/admin/payments", { error: "Choose a product or a category." });
  if (!["none", "percent", "fixed"].includes(mode)) flash("/admin/payments", { error: "Choose what this item needs." });
  const found = (await db.query<{ name: string }>(kind === "product" ? "select name from products where id = $1" : "select name from categories where id = $1", [id]))[0];
  if (!found) flash("/admin/payments", { error: "That product or category no longer exists." });
  const num = (k: string) => { const v = String(form.get(k) ?? "").replace(/[, ]/g, "").trim(); return v === "" ? NaN : Number(v); };
  let bps = 3333; let fixed = 500;
  if (mode === "percent") {
    bps = Math.round(num("percent") * 100);
    if (!Number.isFinite(bps) || bps < 100 || bps > 10_000) flash("/admin/payments", { error: "Enter a percentage between 1 and 100." });
  } else if (mode === "fixed") {
    fixed = num("fixed");
    if (!Number.isSafeInteger(fixed) || fixed < 1) flash("/admin/payments", { error: "Enter the advance per item in whole rupees." });
  }
  const cfg = await getAdvanceConfig(db);
  if (cfg.rules.filter((r) => !(r.kind === kind && r.id === id)).length >= 100) flash("/admin/payments", { error: "You can have up to 100 exceptions." });
  const rule = { kind: kind as "product" | "category", id, label: found!.name.slice(0, 160), mode: mode as "none" | "percent" | "fixed", bps, fixed };
  await saveAdvanceConfig(db, { ...cfg, rules: [...cfg.rules.filter((r) => !(r.kind === kind && r.id === id)), rule] });
  await audit(owner.email, "cod_advance_rule_saved", "settings", "cod_advance", { kind, id, mode, bps, fixed });
  revalidatePath("/checkout");
  flash("/admin/payments", { ok: `Exception saved for ${found!.name}. It applies to new orders only.` });
}

export async function removeAdvanceRuleAction(form: FormData) {
  const owner = await assertAdmin("owner");
  const kind = String(form.get("kind") ?? ""); const id = String(form.get("id") ?? "");
  const db = await getDb();
  const cfg = await getAdvanceConfig(db);
  await saveAdvanceConfig(db, { ...cfg, rules: cfg.rules.filter((r) => !(r.kind === kind && r.id === id)) });
  await audit(owner.email, "cod_advance_rule_removed", "settings", "cod_advance", { kind, id });
  revalidatePath("/checkout");
  flash("/admin/payments", { ok: "Exception removed. That item now follows the general rule." });
}

const WALLET_NUMBER = /^[0-9+\-\s]{10,20}$/;
type MethodKey = "cod" | "bank" | "jazzcash" | "easypaisa";

/** Turns a customer-facing payment method on or off. A method that needs details is refused until they are saved. */
export async function toggleMethodAction(form: FormData) {
  const owner = await assertAdmin("owner");
  const method = String(form.get("method") ?? "") as MethodKey;
  const on = form.get("on") === "1";
  if (!["cod", "bank", "jazzcash", "easypaisa"].includes(method)) flash("/admin/payments", { error: "Unknown payment method." });
  const store = await getStore();
  if (!on && leavesNoPaymentMethod(await getPaymentOptions(await getDb()), method)) flash("/admin/payments", { error: "Keep at least one payment method on. Turn another one on first, or customers could not place orders." });
  if (on && method === "jazzcash" && !store.jazzcashNumber?.trim()) flash("/admin/payments", { error: "Add the JazzCash number first (Configure), then switch it on." });
  if (on && method === "easypaisa" && !store.easypaisaNumber?.trim()) flash("/admin/payments", { error: "Add the Easypaisa number first (Configure), then switch it on." });
  const key = { cod: "codEnabled", bank: "bankTransferEnabled", jazzcash: "jazzcashEnabled", easypaisa: "easypaisaEnabled" }[method] as "codEnabled" | "bankTransferEnabled" | "jazzcashEnabled" | "easypaisaEnabled";
  await saveStore({ ...store, [key]: on });
  await audit(owner.email, on ? "payment_method_enabled" : "payment_method_disabled", "settings", method);
  revalidatePath("/checkout");
  flash("/admin/payments", { ok: `${{ cod: "Cash on delivery", bank: "Bank transfer", jazzcash: "JazzCash", easypaisa: "Easypaisa" }[method]} is now ${on ? "on" : "off"} for customers.` });
}

const clean = (f: FormData, k: string, max: number) => { const v = String(f.get(k) ?? "").trim().slice(0, max); return v === "" ? null : v; };

export async function saveBankAction(form: FormData) {
  const owner = await assertAdmin("owner");
  const store = await getStore();
  await saveStore({ ...store, bankName: clean(form, "bankName", 100), bankAccountTitle: clean(form, "bankAccountTitle", 100), bankAccountNumber: clean(form, "bankAccountNumber", 60), paymentInstructions: clean(form, "paymentInstructions", 600) });
  await audit(owner.email, "bank_details_changed", "settings", "bank", { hasNumber: Boolean(clean(form, "bankAccountNumber", 60)) });
  revalidatePath("/", "layout");
  flash("/admin/payments", { ok: "Bank details saved." });
}

export async function saveWalletAction(form: FormData) {
  const owner = await assertAdmin("owner");
  const kind = String(form.get("kind") ?? "");
  if (kind !== "jazzcash" && kind !== "easypaisa") flash("/admin/payments", { error: "Unknown wallet." });
  const title = clean(form, "title", 100);
  const number = clean(form, "number", 40);
  if (number && !WALLET_NUMBER.test(number)) flash("/admin/payments", { error: "Enter the wallet number using digits only, for example 0300 1234567." });
  const store = await getStore();
  const next = kind === "jazzcash" ? { ...store, jazzcashTitle: title, jazzcashNumber: number } : { ...store, easypaisaTitle: title, easypaisaNumber: number };
  // A wallet with no number cannot stay on: customers would be told to pay nowhere.
  if (!number) { if (kind === "jazzcash") next.jazzcashEnabled = false; else next.easypaisaEnabled = false; }
  await saveStore(next);
  await audit(owner.email, "wallet_details_changed", "settings", kind, { hasNumber: Boolean(number) });
  revalidatePath("/", "layout");
  flash("/admin/payments", { ok: `${kind === "jazzcash" ? "JazzCash" : "Easypaisa"} details saved.` });
}
