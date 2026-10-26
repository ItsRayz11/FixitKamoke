"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { assertAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { flash } from "@/lib/admin/flash";
import { credentialsPresent, GATEWAYS, getGatewaySettings, hasVerifiedPayment, type GatewayId, type GatewayMode } from "@/lib/payments";

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
