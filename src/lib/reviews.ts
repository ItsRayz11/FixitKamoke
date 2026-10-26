import { z } from "zod";
import type { Db } from "@/lib/db";
import { displayName } from "@/lib/domain/display";

export interface Review { id: string; authorName: string; rating: number; body: string; createdAt: string; finish?: string | null }

export const reviewSchema = z.object({
  rating: z.number().int().min(1, "Choose a star rating").max(5),
  body: z.string().trim().min(10, "Please write at least a sentence").max(1500, "That review is too long"),
});

export class ReviewError extends Error {}

/** Reviews for a product. A finish (colour) is a separate product row, so reviews of every finish in the same group are shown together, tagged with the finish. */
export async function approvedReviews(db: Db, productId: string): Promise<Review[]> {
  const r = await db.query<{ id: string; author_name: string; rating: number; body: string; created_at: Date | string; variant_label: string | null }>(
    `select r.id, r.author_name, r.rating, r.body, r.created_at, p.variant_label
     from reviews r join products p on p.id = r.product_id
     where r.status = 'approved' and (r.product_id = $1 or (p.variant_group is not null and p.variant_group = (select variant_group from products where id = $1)))
     order by r.created_at desc limit 50`, [productId]);
  return r.map((x) => ({ id: x.id, authorName: x.author_name, rating: x.rating, body: x.body, createdAt: new Date(x.created_at).toISOString(), finish: x.variant_label }));
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

export interface LatestReview extends Review { productName: string; productSlug: string }

/** Newest moderated reviews across the shop, for the homepage. Empty until real customers have reviewed something. */
export async function latestApprovedReviews(db: Db, limit = 3): Promise<LatestReview[]> {
  const rows = await db.query<{ id: string; author_name: string; rating: number; body: string; created_at: Date | string; name: string; slug: string; variant_label: string | null }>(
    `select r.id, r.author_name, r.rating, r.body, r.created_at, p.name, p.slug, p.variant_label
     from reviews r join products p on p.id = r.product_id
     where r.status = 'approved' and p.published order by r.created_at desc limit $1`, [limit]);
  return rows.map((r) => ({ id: r.id, authorName: r.author_name, rating: r.rating, body: r.body, createdAt: new Date(r.created_at).toISOString(), productName: displayName(r.name, r.variant_label), productSlug: r.slug }));
}
