"use server";

import { z } from "zod";
import { getDb } from "@/lib/db";
import { assertAdmin } from "@/lib/auth/session";
import { flash } from "@/lib/admin/flash";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/domain/order-state";
import { OrderAdminError, setManualShippingFee, setPaymentStatus, transitionOrder } from "@/lib/orders/admin";

const uuid = z.string().uuid();

export async function changeStatusAction(form: FormData) {
  const admin = await assertAdmin("staff");
  const id = uuid.safeParse(form.get("id"));
  const to = z.enum(ORDER_STATUSES).safeParse(form.get("to"));
  if (!id.success || !to.success) flash("/admin/orders", { error: "Invalid request." });
  const back = `/admin/orders/${id.data}`;
  try {
    await transitionOrder(await getDb(), id.data!, to.data as OrderStatus, admin.email, String(form.get("note") ?? "").trim().slice(0, 300) || undefined);
  } catch (e) {
    if (e instanceof OrderAdminError) flash(back, { error: e.message });
    throw e;
  }
  flash(back, { ok: "Status updated." });
}

export async function setFeeAction(form: FormData) {
  const admin = await assertAdmin("staff");
  const id = uuid.safeParse(form.get("id"));
  if (!id.success) flash("/admin/orders", { error: "Invalid request." });
  const back = `/admin/orders/${id.data}`;
  try {
    await setManualShippingFee(await getDb(), id.data!, Number(form.get("fee")), admin.email);
  } catch (e) {
    if (e instanceof OrderAdminError) flash(back, { error: e.message });
    throw e;
  }
  flash(back, { ok: "Delivery fee saved and the total updated." });
}

export async function setPaymentAction(form: FormData) {
  const admin = await assertAdmin("staff");
  const id = uuid.safeParse(form.get("id"));
  const st = z.enum(["unpaid", "pending", "paid", "refunded", "failed"]).safeParse(form.get("status"));
  if (!id.success || !st.success) flash("/admin/orders", { error: "Invalid request." });
  try {
    await setPaymentStatus(await getDb(), id.data!, st.data!, admin.email);
  } catch (e) {
    if (e instanceof OrderAdminError) flash(`/admin/orders/${id.data}`, { error: e.message });
    throw e;
  }
  flash(`/admin/orders/${id.data}`, { ok: "Payment status updated." });
}
