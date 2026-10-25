"use server";

import { headers } from "next/headers";
import { clientIp } from "@/lib/client-ip";
import { getDb } from "@/lib/db";
import { findOrderByPhone, type OrderView } from "@/lib/orders/lookup";
import { rateLimit } from "@/lib/rate-limit";

export async function trackOrder(orderNumber: string, phone: string): Promise<{ order: OrderView | null; error?: string }> {
  const ip = clientIp((await headers()).get.bind(await headers()));
  if (!rateLimit(`track:${ip}`, 10, 10 * 60_000)) return { order: null, error: "Too many attempts. Please wait a few minutes." };
  if (typeof orderNumber !== "string" || typeof phone !== "string" || orderNumber.length > 30 || phone.length > 30) return { order: null };
  // Same response whether the number or the phone was wrong, so order numbers cannot be probed.
  return { order: await findOrderByPhone(await getDb(), orderNumber, phone) };
}
