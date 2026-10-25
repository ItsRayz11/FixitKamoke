"use server";

import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { getDb } from "@/lib/db";
import { getCustomer } from "@/lib/auth/session";
import { flash } from "@/lib/admin/flash";
import { ReviewError, submitReview } from "@/lib/reviews";

export async function submitReviewAction(form: FormData) {
  const slug = String(form.get("slug") ?? "");
  const productId = String(form.get("productId") ?? "");
  const back = `/product/${slug}`;
  const c = await getCustomer();
  if (!c) redirect(`/account/login?next=${encodeURIComponent(back)}`);
  try {
    await submitReview(await getDb(), c, productId, { rating: Number(form.get("rating")), body: String(form.get("body") ?? "") });
  } catch (e) {
    if (e instanceof ReviewError) flash(back, { error: e.message });
    if (e instanceof ZodError) flash(back, { error: e.issues[0]?.message ?? "Please check your review." });
    throw e;
  }
  flash(back, { ok: "Thank you. Your review will appear once our team has approved it." });
}
