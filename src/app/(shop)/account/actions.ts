"use server";

import { headers } from "next/headers";
import { clientIp } from "@/lib/client-ip";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { getDb } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { flash } from "@/lib/admin/flash";
import { endCustomerSession, getCustomer, startCustomerSession } from "@/lib/auth/session";
import {
  authenticateCustomer, changePassword, createPasswordReset, CustomerError, deleteAddress, deleteCustomerAccount, registerCustomer, resetPassword, saveAddress, toggleWishlist,
} from "@/lib/customers/customers";
import { sendQueuedEmailSoon } from "@/lib/email/run";

const ip = async () => clientIp((await headers()).get.bind(await headers()));
const str = (f: FormData, k: string) => String(f.get(k) ?? "");

/** Only same-site paths are allowed as a post-login destination (prevents open redirects). */
export async function safeNext(n: string | null | undefined): Promise<string> {
  return n && /^\/(?!\/)[\w\-./?=&%]*$/.test(n) && !n.startsWith("/admin") ? n : "/account";
}

function problem(e: unknown): string | null {
  if (e instanceof CustomerError) return e.message;
  if (e instanceof ZodError) return e.issues[0]?.message ?? "Please check your details.";
  return null;
}

export async function registerAction(form: FormData) {
  const back = "/account/register";
  if (!rateLimit(`register:${await ip()}`, 8, 60 * 60_000)) flash(back, { error: "Too many attempts. Please try again later." });
  let id: string;
  try {
    id = await registerCustomer(await getDb(), { name: str(form, "name"), email: str(form, "email"), phone: str(form, "phone"), password: str(form, "password") });
  } catch (e) {
    const m = problem(e);
    if (m) flash(back, { error: m });
    throw e;
  }
  await startCustomerSession(id);
  redirect(await safeNext(str(form, "next")));
}

export async function loginAction(form: FormData) {
  const next = str(form, "next");
  const back = `/account/login${next ? `?next=${encodeURIComponent(next)}` : ""}`;
  if (!rateLimit(`customer-login:${await ip()}`, 10, 15 * 60_000)) flash(back, { error: "Too many attempts. Please try again in a few minutes." });
  let id: string;
  try {
    id = await authenticateCustomer(await getDb(), str(form, "email"), str(form, "password"));
  } catch (e) {
    if (e instanceof CustomerError) flash(back, { error: e.message });
    throw e;
  }
  await startCustomerSession(id);
  redirect(await safeNext(next));
}

export async function logoutAction() {
  await endCustomerSession();
  redirect("/");
}

/** Always answers the same way so the form cannot be used to find out who has an account. */
export async function forgotAction(form: FormData) {
  if (!rateLimit(`forgot:${await ip()}`, 5, 60 * 60_000)) flash("/account/forgot", { error: "Too many requests. Please try again later." });
  const email = str(form, "email").trim();
  if (/^\S+@\S+\.\S+$/.test(email) && email.length <= 200) {
    await createPasswordReset(await getDb(), email);
    sendQueuedEmailSoon();
  }
  flash("/account/forgot", { ok: "If an account exists for that email, we have sent a link to reset the password. It works for 1 hour." });
}

export async function resetAction(form: FormData) {
  const token = str(form, "token");
  const back = `/account/reset?token=${encodeURIComponent(token)}`;
  if (!rateLimit(`reset:${await ip()}`, 10, 60 * 60_000)) flash(back, { error: "Too many attempts. Please try again later." });
  if (str(form, "password") !== str(form, "confirm")) flash(back, { error: "The two passwords do not match." });
  try {
    await resetPassword(await getDb(), token, str(form, "password"));
  } catch (e) {
    if (e instanceof CustomerError) flash(e.code === "bad_token" ? "/account/forgot" : back, { error: e.message });
    throw e;
  }
  flash("/account/login", { ok: "Your password has been changed. Please sign in." });
}

async function mustBeCustomer() {
  const c = await getCustomer();
  if (!c) redirect("/account/login");
  return c;
}

export async function changePasswordAction(form: FormData) {
  const c = await mustBeCustomer();
  const back = "/account/security";
  if (str(form, "password") !== str(form, "confirm")) flash(back, { error: "The two new passwords do not match." });
  try {
    await changePassword(await getDb(), c.id, str(form, "current"), str(form, "password"));
  } catch (e) {
    if (e instanceof CustomerError) flash(back, { error: e.message });
    throw e;
  }
  flash(back, { ok: "Password changed." });
}

export async function deleteAccountAction(form: FormData) {
  const c = await mustBeCustomer();
  if (str(form, "confirm") !== "DELETE") flash("/account/security", { error: "Type DELETE to confirm." });
  try {
    await deleteCustomerAccount(await getDb(), c.id, str(form, "password"));
  } catch (e) {
    if (e instanceof CustomerError) flash("/account/security", { error: e.message });
    throw e;
  }
  await endCustomerSession();
  redirect("/?deleted=1");
}

export async function saveAddressAction(form: FormData) {
  const c = await mustBeCustomer();
  const id = str(form, "id") || undefined;
  try {
    await saveAddress(await getDb(), c.id, {
      label: str(form, "label") || "Home", recipientName: str(form, "recipientName"), phone: str(form, "phone"), city: str(form, "city"),
      area: str(form, "area"), address: str(form, "address"), isDefault: form.get("isDefault") === "on",
    }, id);
  } catch (e) {
    const m = problem(e);
    if (m) flash("/account/addresses", { error: m });
    throw e;
  }
  flash("/account/addresses", { ok: "Address saved." });
}

export async function deleteAddressAction(form: FormData) {
  const c = await mustBeCustomer();
  await deleteAddress(await getDb(), c.id, str(form, "id"));
  flash("/account/addresses", { ok: "Address removed." });
}

export async function toggleWishlistAction(form: FormData) {
  const productId = str(form, "productId");
  const slug = str(form, "slug");
  const c = await getCustomer();
  if (!c) redirect(`/account/login?next=${encodeURIComponent(`/product/${slug}`)}`);
  await toggleWishlist(await getDb(), c.id, productId);
  redirect(`/product/${slug}`);
}

/** Puts the still-available items from a past order back in the cart. Quantities are capped to current stock. */
export async function reorderAction(form: FormData) {
  const c = await mustBeCustomer();
  const db = await getDb();
  const items = await db.query<{ product_id: string; quantity: number; stock: number }>(
    `select i.product_id, i.quantity, p.stock from orders o join order_items i on i.order_id = o.id join products p on p.id = i.product_id
     where o.order_number = $1 and o.customer_id = $2 and p.published and p.stock > 0`, [str(form, "order"), c.id]);
  if (items.length === 0) flash("/account", { error: "None of the items from that order are available right now." });
  redirect(`/cart?add=${items.map((i) => `${i.product_id}:${Math.min(i.quantity, i.stock)}`).join(",")}`);
}
