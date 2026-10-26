"use server";

import { headers } from "next/headers";
import { clientIp } from "@/lib/client-ip";
import { getDb } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { StockAlertError, requestStockAlert } from "@/lib/stock-alerts";

export async function stockAlertAction(productId: string, email: string): Promise<{ ok: boolean; message: string }> {
  const ip = clientIp((await headers()).get.bind(await headers()));
  if (!rateLimit(`stock-alert:${ip}`, 8, 60 * 60_000)) return { ok: false, message: "Too many attempts. Please try again later." };
  if (typeof email !== "string" || typeof productId !== "string") return { ok: false, message: "Please enter a valid email address." };
  try {
    await requestStockAlert(await getDb(), productId, email);
    return { ok: true, message: "Done. We will send you one email when it is back in stock. We use your address only for that one message." };
  } catch (e) {
    if (e instanceof StockAlertError) return { ok: false, message: e.message };
    console.error("stock alert failed", e instanceof Error ? e.message : e);
    return { ok: false, message: "Something went wrong. Please try again." };
  }
}
