import { z } from "zod";
import type { Db } from "@/lib/db";

export interface Review { id: string; authorName: string; rating: number; body: string; createdAt: string }

export const reviewSchema = z.object({
  rating: z.number().int().min(1, "Choose a star rating").max(5),
  body: z.string().trim().min(10, "Please write at least a sentence").max(1500, "That review is too long"),
});

export class ReviewError extends Error {}

export async function approvedReviews(db: Db, productId: string): Promise<Review[]> {
  const r = await db.query<{ id: string; author_name: string; rating: number; body: string; created_at: Date | string }>(
    "select id, author_name, rating, body, created_at from reviews where product_id = $1 and status = 'approved' order by created_at desc limit 50", [productId]);
  return r.map((x) => ({ id: x.id, authorName: x.author_name, rating: x.rating, body: x.body, createdAt: new Date(x.created_at).toISOString() }));
}

/** A customer may review a product only if they received it (delivered order on their account) and have not reviewed it yet. */
export async function canReview(db: Db, customerId: string, productId: string): Promise<"yes" | "not_purchased" | "already"> {
  const bought = await db.query(
    `select 1 from orders o join order_items i on i.order_id = o.id where o.customer_id = $1 and i.product_id = $2 and o.status = 'delivered' limit 1`, [customerId, productId]);
  if (!bought[0]) return "not_purchased";
  const done = await db.query("select 1 from reviews where customer_id = $1 and product_id = $2", [customerId, productId]);
  return done[0] ? "already" : "yes";
}

export async function submitReview(db: Db, customer: { id: string; name: string }, productId: string, raw: unknown): Promise<void> {
  const d = reviewSchema.parse(raw);
  const can = await canReview(db, customer.id, productId);
  if (can === "not_purchased") throw new ReviewError("Only customers who received this product can review it.");
  if (can === "already") throw new ReviewError("You have already reviewed this product.");
  // Shown as the first name plus initial. Starts as "pending": nothing is public until a person approves it.
  const [first, ...rest] = customer.name.trim().split(/\s+/);
  const display = rest.length ? `${first} ${rest[rest.length - 1][0].toUpperCase()}.` : first;
  await db.query("insert into reviews(product_id, customer_id, author_name, rating, body, status) values ($1,$2,$3,$4,$5,'pending')", [productId, customer.id, display, d.rating, d.body]);
}
