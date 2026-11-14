"use server";

import { headers } from "next/headers";
import { clientIp } from "@/lib/client-ip";
import { getDb } from "@/lib/db";
import { hashToken } from "@/lib/orders/create-order";
import { cloudinaryConfig, CUSTOMER_UPLOAD_FOLDERS, uploadTicket, type CustomerUploadKind, type UploadTicket } from "@/lib/cloudinary";
import { rateLimit } from "@/lib/rate-limit";
import { PaymentProofError, submitReceipt } from "@/lib/orders/payment-proof";

type TicketResult = { ticket?: UploadTicket; error?: string };

const ip = async () => { const h = await headers(); return clientIp((n) => h.get(n)); };

function ticketFor(kind: CustomerUploadKind): TicketResult {
  const cfg = cloudinaryConfig();
  if (!cfg) return { error: "Photo upload is not available right now." };
  return { ticket: uploadTicket(cfg, CUSTOMER_UPLOAD_FOLDERS[kind]) };
}

/** A short-lived signed ticket so a customer can send photos of their phone with a repair request. Limited per visitor. */
export async function repairPhotoTicket(): Promise<TicketResult> {
  if (!rateLimit(`upload-repair:${await ip()}`, 12, 60 * 60_000)) return { error: "Too many uploads. Please try again later, or send the photos on WhatsApp." };
  return ticketFor("repair");
}

/** A signed ticket for a payment receipt. Only someone holding the order's private link can get one, and only while the order still waits for money. */
export async function receiptTicket(orderNumber: string, token: string): Promise<TicketResult> {
  if (typeof orderNumber !== "string" || typeof token !== "string" || orderNumber.length > 30 || token.length > 100) return { error: "Please check the details and try again." };
  if (!rateLimit(`upload-receipt:${await ip()}`, 12, 60 * 60_000)) return { error: "Too many uploads. Please try again later." };
  const o = (await (await getDb()).query<{ payment_status: string; status: string }>("select payment_status, status from orders where order_number = $1 and tracking_token_hash = $2", [orderNumber.toUpperCase(), hashToken(token)]))[0];
  if (!o) return { error: "We could not find that order." };
  if (o.payment_status === "paid" || ["cancelled", "rejected", "returned"].includes(o.status)) return { error: "This order does not need a receipt." };
  return ticketFor("receipt");
}

/** After the browser has uploaded the picture, the customer sends us its link. It is checked and saved on the order. */
export async function sendReceipt(orderNumber: string, token: string, urls: unknown): Promise<{ ok: boolean; message: string }> {
  if (!rateLimit(`pay-receipt:${await ip()}`, 10, 60 * 60_000)) return { ok: false, message: "Too many attempts. Please try again later." };
  if (typeof orderNumber !== "string" || typeof token !== "string") return { ok: false, message: "Please check the details and try again." };
  try {
    await submitReceipt(await getDb(), orderNumber, token, urls, cloudinaryConfig()?.cloudName);
    return { ok: true, message: "Thank you. We have your receipt and will confirm the payment shortly." };
  } catch (e) {
    if (e instanceof PaymentProofError) return { ok: false, message: e.message };
    console.error("receipt failed", e instanceof Error ? e.message : e);
    return { ok: false, message: "Something went wrong. Please try again or message us." };
  }
}
