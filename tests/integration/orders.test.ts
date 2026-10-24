import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/lib/db";
import { migrate } from "@/lib/db/migrate";
import { CheckoutError, createOrder } from "@/lib/orders/create-order";

let db: Db;
let cable: string;
let charger: string;
let hidden: string;
let n = 0;
const key = () => `test-idempotency-key-${++n}-${"x".repeat(8)}`;

const base = {
  customerName: "Test Customer",
  phone: "0300 1234567",
  city: "Kamoki",
  address: "Test street 1, Test area",
  paymentMethod: "cod" as const,
};

beforeAll(async () => {
  db = await createPgliteDb();
  await migrate(db);
  await db.query(
    "insert into store_settings(key,value) values ('shipping',$1)",
    [JSON.stringify({
      version: "test-v1",
      unlistedCity: "manual_confirmation",
      zones: [
        { id: "local", label: "Local", cities: ["Kamoki"], fee: 0, freeThreshold: null, codAvailable: true, etaDays: [1, 1] },
        { id: "pk", label: "Pakistan", cities: ["Lahore"], fee: 300, freeThreshold: null, codAvailable: false, etaDays: [3, 5] },
      ],
    })],
  );
  const ins = async (slug: string, price: number, sale: number | null, stock: number, published = true) =>
    (await db.query<{ id: string }>(
      "insert into products(slug,name,price,sale_price,stock,published,sku) values ($1,$1,$2,$3,$4,$5,$1) returning id",
      [slug, price, sale, stock, published],
    ))[0].id;
  cable = await ins("test-cable", 500, 400, 5);
  charger = await ins("test-charger", 1000, null, 2);
  hidden = await ins("test-hidden", 100, null, 9, false);
  await db.query("insert into coupons(code,type,value,min_subtotal) values ('SAVE10','percent',10,1000)");
});
afterAll(() => db.close());

describe("createOrder", () => {
  it("uses server prices, snapshots items, decrements stock, free local delivery", async () => {
    const o = await createOrder(db, { ...base, idempotencyKey: key(), items: [{ productId: cable, quantity: 2 }] });
    expect(o.total).toBe(800); // sale price 400 x 2
    expect(o.shippingFee).toBe(0);
    expect(o.trackingToken).toBeTruthy();
    const items = await db.query<{ unit_price: number; quantity: number }>("select unit_price, quantity from order_items");
    expect(items[0]).toMatchObject({ unit_price: 400, quantity: 2 });
    expect((await db.query<{ stock: number }>("select stock from products where id=$1", [cable]))[0].stock).toBe(3);
    const stored = await db.query<{ phone: string; tracking_token_hash: string }>("select phone, tracking_token_hash from orders");
    expect(stored[0].phone).toBe("+923001234567");
    expect(stored[0].tracking_token_hash).not.toBe(o.trackingToken);
  });

  it("ignores any client-supplied prices", async () => {
    const o = await createOrder(db, { ...base, idempotencyKey: key(), items: [{ productId: cable, quantity: 1, price: 1 }], total: 1 });
    expect(o.total).toBe(400);
  });

  it("is idempotent: a retry returns the same order and does not take stock twice", async () => {
    const k = key();
    const before = (await db.query<{ stock: number }>("select stock from products where id=$1", [charger]))[0].stock;
    const a = await createOrder(db, { ...base, idempotencyKey: k, items: [{ productId: charger, quantity: 1 }] });
    const b = await createOrder(db, { ...base, idempotencyKey: k, items: [{ productId: charger, quantity: 1 }] });
    expect(b.duplicate).toBe(true);
    expect(b.orderNumber).toBe(a.orderNumber);
    expect((await db.query<{ stock: number }>("select stock from products where id=$1", [charger]))[0].stock).toBe(before - 1);
  });

  it("refuses to oversell and rolls the whole order back", async () => {
    const stockBefore = (await db.query<{ stock: number }>("select stock from products where id=$1", [cable]))[0].stock;
    await expect(
      createOrder(db, { ...base, idempotencyKey: key(), items: [{ productId: cable, quantity: 1 }, { productId: charger, quantity: 50 }] }),
    ).rejects.toMatchObject({ code: "out_of_stock" });
    expect((await db.query<{ stock: number }>("select stock from products where id=$1", [cable]))[0].stock).toBe(stockBefore);
  });

  it("rejects unpublished products and bad phones", async () => {
    await expect(createOrder(db, { ...base, idempotencyKey: key(), items: [{ productId: hidden, quantity: 1 }] })).rejects.toMatchObject({ code: "unavailable" });
    await expect(createOrder(db, { ...base, phone: "12345678901", idempotencyKey: key(), items: [{ productId: cable, quantity: 1 }] })).rejects.toBeInstanceOf(CheckoutError);
  });

  it("charges configured shipping, blocks COD where disabled, flags unlisted cities", async () => {
    await expect(createOrder(db, { ...base, city: "Lahore", idempotencyKey: key(), items: [{ productId: cable, quantity: 1 }] })).rejects.toMatchObject({ code: "cod_unavailable" });
    const o = await createOrder(db, { ...base, city: "Lahore", paymentMethod: "bank_transfer", idempotencyKey: key(), items: [{ productId: cable, quantity: 1 }] });
    expect(o).toMatchObject({ shippingFee: 300, total: 700 });
    const u = await createOrder(db, { ...base, city: "Gwadar", idempotencyKey: key(), items: [{ productId: cable, quantity: 1 }] });
    expect(u.shippingStatus).toBe("needs_confirmation");
  });

  it("applies valid coupons server-side and rejects unknown ones", async () => {
    await db.query("update products set stock = 5 where id in ($1,$2)", [cable, charger]);
    const o = await createOrder(db, { ...base, idempotencyKey: key(), couponCode: "save10", items: [{ productId: charger, quantity: 1 }] });
    expect(o.total).toBe(900);
    await expect(createOrder(db, { ...base, idempotencyKey: key(), couponCode: "NOPE", items: [{ productId: cable, quantity: 1 }] })).rejects.toMatchObject({ code: "bad_coupon" });
  });
});
