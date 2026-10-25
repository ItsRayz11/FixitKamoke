import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/lib/db";
import { migrate } from "@/lib/db/migrate";
import { createOrder } from "@/lib/orders/create-order";
import { transitionOrder } from "@/lib/orders/admin";
import { registerCustomer } from "@/lib/customers/customers";
import { approvedReviews, canReview, ReviewError, submitReview } from "@/lib/reviews";

let db: Db;
let pid: string;
let me: { id: string; name: string };

beforeAll(async () => {
  db = await createPgliteDb();
  await migrate(db);
  await db.query("insert into store_settings(key,value) values ('shipping',$1)", [JSON.stringify({ version: "t", unlistedCity: "manual_confirmation", zones: [{ id: "l", label: "L", cities: ["Kamoki"], fee: 0, freeThreshold: null, codAvailable: true, etaDays: null }] })]);
  pid = (await db.query<{ id: string }>("insert into products(slug,name,price,stock,published) values ('r','R',100,10,true) returning id"))[0].id;
  me = { id: await registerCustomer(db, { name: "Ayesha Bibi Khan", email: "rev@example.com", password: "Review-pass-123" }), name: "Ayesha Bibi Khan" };
});
afterAll(() => db.close());

describe("reviews", () => {
  it("only customers with a delivered order for the product can review, once", async () => {
    expect(await canReview(db, me.id, pid)).toBe("not_purchased");
    await expect(submitReview(db, me, pid, { rating: 5, body: "Great product, works well." })).rejects.toBeInstanceOf(ReviewError);

    const o = await createOrder(db, { customerName: me.name, phone: "0300 1112233", city: "Kamoki", address: "House 4, Street 9", paymentMethod: "cod", idempotencyKey: "review-order-key-1-xxxxxxx", items: [{ productId: pid, quantity: 1 }] }, { customerId: me.id });
    const id = (await db.query<{ id: string }>("select id from orders where order_number=$1", [o.orderNumber]))[0].id;
    expect(await canReview(db, me.id, pid)).toBe("not_purchased"); // ordered but not delivered
    for (const s of ["confirmed", "processing", "shipped", "delivered"] as const) await transitionOrder(db, id, s, "staff");
    expect(await canReview(db, me.id, pid)).toBe("yes");

    await submitReview(db, me, pid, { rating: 4, body: "Works as described, fast delivery." });
    expect(await canReview(db, me.id, pid)).toBe("already");
    await expect(submitReview(db, me, pid, { rating: 5, body: "Trying to review twice here." })).rejects.toThrow(/already reviewed/);
  });

  it("stays hidden until approved, and shows only a short name", async () => {
    expect(await approvedReviews(db, pid)).toHaveLength(0);
    const r = (await db.query<{ author_name: string; status: string }>("select author_name, status from reviews"))[0];
    expect(r).toEqual({ author_name: "Ayesha K.", status: "pending" });
    await db.query("update reviews set status = 'approved'");
    expect((await approvedReviews(db, pid))[0]).toMatchObject({ authorName: "Ayesha K.", rating: 4 });
  });

  it("validates rating and text", async () => {
    await expect(submitReview(db, me, pid, { rating: 6, body: "Long enough text here." })).rejects.toThrow();
    await expect(submitReview(db, me, pid, { rating: 3, body: "short" })).rejects.toThrow();
  });
});
