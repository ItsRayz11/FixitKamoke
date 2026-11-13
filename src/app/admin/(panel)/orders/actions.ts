"use server";

import { z } from "zod";
import { getDb } from "@/lib/db";
import { assertAdmin } from "@/lib/auth/session";
import { flash } from "@/lib/admin/flash";
import { sendQueuedEmailSoon } from "@/lib/email/run";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/domain/order-state";
import { addOrderNote, OrderAdminError, recordBalanceCollected, recordRefund, setDispatchDetails, setManualShippingFee, setPaymentStatus, transitionOrder, verifyAdvance } from "@/lib/orders/admin";

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
  sendQueuedEmailSoon();
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
  const st = z.enum(["unpaid", "pending", "partial", "paid", "refunded", "partially_refunded", "failed"]).safeParse(form.get("status"));
  if (!id.success || !st.success) flash("/admin/orders", { error: "Invalid request." });
  try {
    await setPaymentStatus(await getDb(), id.data!, st.data!, admin.email);
  } catch (e) {
    if (e instanceof OrderAdminError) flash(`/admin/orders/${id.data}`, { error: e.message });
    throw e;
  }
  flash(`/admin/orders/${id.data}`, { ok: "Payment status updated." });
}

export async function verifyAdvanceAction(form: FormData) {
  const admin = await assertAdmin("staff");
  const id = uuid.safeParse(form.get("id"));
  if (!id.success) flash("/admin/orders", { error: "Invalid request." });
  const back = `/admin/orders/${id.data}`;
  try {
    await verifyAdvance(await getDb(), id.data!, Number(String(form.get("received") ?? "").replace(/[, ]/g, "")), admin.email);
  } catch (e) {
    if (e instanceof OrderAdminError) flash(back, { error: e.message });
    throw e;
  }
  sendQueuedEmailSoon();
  flash(back, { ok: "Advance verified and recorded." });
}

const whole = (v: FormDataEntryValue | null) => Number(String(v ?? "").replace(/[, ]/g, ""));

async function run(form: FormData, ok: string, fn: (db: Awaited<ReturnType<typeof getDb>>, id: string, who: string) => Promise<void>, after?: () => void, role: "staff" | "manager" = "staff") {
  const admin = await assertAdmin(role);
  const id = uuid.safeParse(form.get("id"));
  if (!id.success) flash("/admin/orders", { error: "Invalid request." });
  const back = `/admin/orders/${id.data}`;
  try {
    await fn(await getDb(), id.data!, admin.email);
  } catch (e) {
    if (e instanceof OrderAdminError) flash(back, { error: e.message });
    throw e;
  }
  after?.();
  flash(back, { ok });
}

export async function dispatchDetailsAction(form: FormData) {
  await run(form, "Courier details saved.", (db, id, who) => setDispatchDetails(db, id, String(form.get("carrier") ?? ""), String(form.get("trackingNumber") ?? ""), who));
}
export async function balanceCollectedAction(form: FormData) {
  await run(form, "Cash collection recorded. The order is now fully paid.", (db, id, who) => recordBalanceCollected(db, id, whole(form.get("amount")), who));
}
export async function refundAction(form: FormData) {
  await run(form, "Refund recorded.", (db, id, who) => recordRefund(db, id, whole(form.get("amount")), who, String(form.get("note") ?? "").trim().slice(0, 200) || undefined), sendQueuedEmailSoon, "manager"); // refunds are money going out: managers and owners only
}
export async function noteAction(form: FormData) {
  await run(form, "Note added.", (db, id, who) => addOrderNote(db, id, String(form.get("body") ?? ""), who));
}
