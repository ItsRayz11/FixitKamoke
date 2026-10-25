"use server";

import { headers } from "next/headers";
import { clientIp } from "@/lib/client-ip";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { normalizePkMobile } from "@/lib/domain/phone";
import { queueStaffAlert } from "@/lib/email/alerts";
import { sendQueuedEmailSoon } from "@/lib/email/run";

const schema = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(100),
  phone: z.string().trim().max(20).optional().or(z.literal("").transform(() => undefined)),
  email: z.string().trim().email("Please enter a valid email address").max(200).optional().or(z.literal("").transform(() => undefined)),
  message: z.string().trim().min(5, "Please write a short message").max(2000),
  // Honeypot: real people never see or fill this field.
  website: z.string().max(0).optional(),
});

export type ContactResult = { ok: true } | { ok: false; message: string; fieldErrors?: Record<string, string> };

export async function sendContact(input: unknown): Promise<ContactResult> {
  const ip = clientIp((await headers()).get.bind(await headers()));
  if (!rateLimit(`contact:${ip}`, 5, 30 * 60_000)) return { ok: false, message: "Too many messages. Please wait a while, or use WhatsApp." };
  const p = schema.safeParse(input);
  if (!p.success) {
    // A filled honeypot looks like success to the bot but stores nothing.
    if (p.error.issues.some((i) => i.path[0] === "website")) return { ok: true };
    const fieldErrors: Record<string, string> = {};
    for (const i of p.error.issues) fieldErrors[String(i.path[0] ?? "form")] ??= i.message;
    return { ok: false, message: "Please check the highlighted fields.", fieldErrors };
  }
  const d = p.data;
  let phone: string | null = null;
  if (d.phone) {
    phone = normalizePkMobile(d.phone);
    if (!phone) return { ok: false, message: "Please check the highlighted fields.", fieldErrors: { phone: "Please enter a valid Pakistani mobile number." } };
  }
  if (!phone && !d.email) return { ok: false, message: "Please give a phone number or an email so we can reply.", fieldErrors: { phone: "Add a phone number or an email." } };
  const db = await getDb();
  await db.tx(async (q) => {
    const r = await q.query<{ id: string }>("insert into contact_messages(name, phone, email, message) values ($1,$2,$3,$4) returning id", [d.name, phone, d.email ?? null, d.message]);
    await queueStaffAlert(q, "message", r[0].id.slice(0, 8).toUpperCase(), `From ${d.name.slice(0, 40)}: ${d.message.slice(0, 100)}`);
  });
  sendQueuedEmailSoon();
  return { ok: true };
}
