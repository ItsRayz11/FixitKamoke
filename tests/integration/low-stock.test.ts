import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/lib/db";
import { migrate } from "@/lib/db/migrate";
import { createOrder } from "@/lib/orders/create-order";
import { crossedIntoLow, LOW_STOCK } from "@/lib/domain/stock";

let db: Db;
let item: string;
let n = 0;
const key = () => `lowstock-key-${++n}-${"x".repeat(10)}`;
const buy = (qty: number) => createOrder(db, { customerName: "Stock Person", phone: "0300 1234567", city: "Kamoki", address: "Test street 1, Test area", paymentMethod: "cod", idempotencyKey: key(), items: [{ productId: item, quantity: qty }] });
const alerts = async () => (await db.query<{ payload: { ref: string; summary: string; kind: string } }>("select payload from notification_outbox where kind = 'staff_alert' and payload->>'kind' = 'stock' order by created_at")).map((r) => r.payload);

beforeAll(async () => {
  db = await createPgliteDb();
  await migrate(db);
  await db.query("insert into store_settings(key,value) values ('shipping',$1)", [JSON.stringify({ version: "t", unlistedCity: "manual_confirmation", zones: [{ id: "l", label: "L", cities: ["Kamoki"], fee: 0, freeThreshold: null, codAvailable: true, etaDays: [1, 1] }] })]);
  await db.query("insert into store_settings(key,value) values ('store',$1)", [JSON.stringify({ contactEmail: "owner@example.test", notifyStaffByEmail: true })]);
  item = (await db.query<{ id: string }>("insert into products(slug,name,price,stock,published,sku) values ('ls','Low Stock Item',500,10,true,'LS') returning id"))[0].id;
});
afterAll(() => db.close());

describe("low-stock alert", () => {
  it("fires only when stock crosses into the low range", () => {
    expect(LOW_STOCK).toBe(3);
    expect(crossedIntoLow(10, 4)).toBe(false);
    expect(crossedIntoLow(5, 3)).toBe(true);
    expect(crossedIntoLow(4, 0)).toBe(true);
    expect(crossedIntoLow(3, 2)).toBe(false); // already low: no second alert
    expect(crossedIntoLow(2, 0)).toBe(false);
  });

  it("emails the shop once when an order takes a product to 3 or fewer, and not on later orders", async () => {
    await buy(2); // 10 -> 8
    await buy(4); // 8 -> 4
    expect(await alerts()).toHaveLength(0);
    await buy(1); // 4 -> 3: crossed
    const a = await alerts();
    expect(a).toHaveLength(1);
    expect(a[0].summary).toBe("Low Stock Item: only 3 left");
    await buy(1); // 3 -> 2: already low, no new alert
    expect(await alerts()).toHaveLength(1);
  });

  it("says sold out when the order takes the last one, and a refused order sends nothing", async () => {
    await expect(buy(99)).rejects.toThrow(); // not enough stock: whole order rolls back, no alert
    expect(await alerts()).toHaveLength(1);
    const sold = (await db.query<{ id: string }>("insert into products(slug,name,price,stock,published,sku) values ('ls2','Last One',500,4,true,'L2') returning id"))[0].id;
    await createOrder(db, { customerName: "Stock Person", phone: "0300 1234567", city: "Kamoki", address: "Test street 1, Test area", paymentMethod: "cod", idempotencyKey: key(), items: [{ productId: sold, quantity: 4 }] });
    expect((await alerts()).map((x) => x.summary)).toContain("Last One: sold out");
  });
});
