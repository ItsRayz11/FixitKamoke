"use server";

import { headers } from "next/headers";
import { clientIp } from "@/lib/client-ip";
import { getDb } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { MarketingError, subscribe } from "@/lib/marketing";

export async function subscribeAction(email: string, consented: boolean): Promise<{ ok: boolean; message: string }> {
  const ip = clientIp((await headers()).get.bind(await headers()));
  if (!rateLimit(`newsletter:${ip}`, 6, 60 * 60_000)) return { ok: false, message: "Too many attempts. Please try again later." };
  if (typeof email !== "string") return { ok: false, message: "Please enter a valid email address." };
  try {
    await subscribe(await getDb(), email, "footer", consented === true);
    return { ok: true, message: "Thank you. You are signed up and can unsubscribe at any time." };
  } catch (e) {
    if (e instanceof MarketingError) return { ok: false, message: e.message };
    console.error("subscribe failed", e instanceof Error ? e.message : e);
    return { ok: false, message: "Something went wrong. Please try again." };
  }
}
