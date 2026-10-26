"use server";

import { assertAdmin } from "@/lib/auth/session";
import { cloudinaryConfig, uploadTicket, type UploadTicket } from "@/lib/cloudinary";
import { rateLimit } from "@/lib/rate-limit";

/** Issues a short-lived, signed upload ticket. Managers and owners only; the API secret stays on the server. */
export async function uploadTicketAction(kind: "photo" | "spin"): Promise<{ ticket?: UploadTicket; error?: string }> {
  const admin = await assertAdmin("manager");
  const cfg = cloudinaryConfig();
  if (!cfg) return { error: "Photo upload is not set up on this server yet. You can paste https links instead." };
  if (!rateLimit(`upload-ticket:${admin.id}`, 400, 60 * 60_000)) return { error: "Too many uploads this hour. Please try again later." };
  return { ticket: uploadTicket(cfg, kind === "spin" ? "fixit/spin" : "fixit/products") };
}
