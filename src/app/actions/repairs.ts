"use server";

import { headers } from "next/headers";
import { ZodError } from "zod";
import { getDb } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { createRepairInquiry, findRepairByPhone, RepairError, type RepairView } from "@/lib/repairs/repairs";

const ip = async () => (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

export type SubmitRepairResult =
  | { ok: true; reference: string; token: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

export async function submitRepair(input: unknown): Promise<SubmitRepairResult> {
  if (!rateLimit(`repair:${await ip()}`, 6, 30 * 60_000)) return { ok: false, message: "Too many requests. Please wait a while, or message us on WhatsApp." };
  try {
    const r = await createRepairInquiry(await getDb(), input);
    return { ok: true, reference: r.reference, token: r.token };
  } catch (e) {
    if (e instanceof RepairError) return { ok: false, message: e.message, fieldErrors: e.code === "invalid_phone" ? { phone: e.message } : undefined };
    if (e instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const i of e.issues) fieldErrors[String(i.path[0] ?? "form")] ??= i.message;
      return { ok: false, message: "Please check the highlighted fields.", fieldErrors };
    }
    console.error("submitRepair failed", e instanceof Error ? e.message : e);
    return { ok: false, message: "Something went wrong. Please try again, or message us on WhatsApp." };
  }
}

export async function trackRepair(reference: string, phone: string): Promise<{ repair: RepairView | null; error?: string }> {
  if (!rateLimit(`repair-track:${await ip()}`, 10, 10 * 60_000)) return { repair: null, error: "Too many attempts. Please wait a few minutes." };
  if (typeof reference !== "string" || typeof phone !== "string" || reference.length > 30 || phone.length > 30) return { repair: null };
  return { repair: await findRepairByPhone(await getDb(), reference, phone) };
}
