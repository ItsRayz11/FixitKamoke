"use server";

import { z } from "zod";
import { getDb } from "@/lib/db";
import { assertAdmin } from "@/lib/auth/session";
import { flash } from "@/lib/admin/flash";
import { REPAIR_STATUSES } from "@/lib/domain/repair-state";
import { RepairError, updateRepair } from "@/lib/repairs/repairs";

export async function updateRepairAction(form: FormData) {
  const admin = await assertAdmin("staff");
  const id = z.string().uuid().safeParse(form.get("id"));
  if (!id.success) flash("/admin/repairs", { error: "Invalid request." });
  const back = `/admin/repairs/${id.data}`;
  const to = String(form.get("to") ?? "");
  const amountRaw = String(form.get("estimateAmount") ?? "").trim();
  // Always sent as a string so an emptied box clears the stored text.
  const text = (k: string) => String(form.get(k) ?? "").trim().slice(0, 1000);
  try {
    await updateRepair(await getDb(), id.data!, {
      to: (REPAIR_STATUSES as readonly string[]).includes(to) ? (to as (typeof REPAIR_STATUSES)[number]) : undefined,
      estimateAmount: amountRaw === "" ? null : Number(amountRaw),
      estimateIsConfirmed: form.get("estimateIsConfirmed") === "on",
      customerMessage: text("customerMessage"),
      staffNotes: text("staffNotes"),
      note: text("note") || undefined,
    }, admin.email);
  } catch (e) {
    if (e instanceof RepairError) flash(back, { error: e.message });
    throw e;
  }
  flash(back, { ok: "Repair request updated." });
}
