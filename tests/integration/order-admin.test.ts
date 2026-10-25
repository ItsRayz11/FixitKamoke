import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/lib/db";
import { migrate } from "@/lib/db/migrate";
import { createOrder } from "@/lib/orders/create-order";
import { OrderAdminError, setManualShippingFee, transitionOrder } from "@/lib/orders/admin";

let db: Db;
let product: string;
let n = 0;
const base = { customerName: "Test Customer", phone: "0300 1234567", email: "buyer@example.com", city: "Kamoki", address: "Test street 1, area", paymentMethod: "cod" as const };

async function place(city = "Kamoki", qty = 2) {
  const o = await createOrder(db, { ...base, city, idempotencyKey: `admin-test-key-${++n}-${"y".repeat(10)}`, items: [{ productId: product, quantity: qty }] });
  const id = (await db.query<{ id: string }>("select id from orders where order_number = $1", [o.orderNumber]))[0].id;
  return { id, number: o.orderNumber };
}
const stock = async () => (await db.query<{ stock: number }>("select stock from products where id = $1", [product]))[0].stock;

beforeAll(async () => {
  db = await createPgliteDb();
  await migrate(db);
  await db.query("insert into store_settings(key,value) values ('shipping',$1)", [JSON.stringify({
    version: "t1", unlistedCity: "manual_confirmation",
    zones: [{ id: "local", label: "Local", cities: ["Kamoki"], fee: 0, freeThreshold: null, codAvailable: true, etaDays: null }],
  })]);
  product = (await db.query<{ id: string }>("insert into products(slug,name,price,stock,published) values ('p','P',100,10,true) returning id"))[0].id;
});
afterAll(() => db.close());

describe("order status transitions", () => {
  it("walks the happy path, writes history and queues one email per milestone", async () => {
    const { id, number } = await place();
    for (const s of ["confirmed", "processing", "shipped", "delivered"] as const) await transitionOrder(db, id, s, "staff@test");
    expect((await db.query<{ status: string }>("select status from orders where id=$1", [id]))[0].status).toBe("delivered");
    const hist = await db.query("select 1 from order_status_history where order_id=$1", [id]);
    expect(hist.length).toBe(5); // created + 4 transitions
    const kinds = (await db.query<{ kind: string }>("select kind from notification_outbox where dedupe_key like '%' || $1", [number])).map((r) => r.kind).sort();
    expect(kinds).toEqual(["order_confirmed", "order_delivered", "order_received", "order_shipped"]);
    expect((await db.query("select 1 from audit_events where entity_id=$1", [id])).length).toBe(4);
  });

  it("rejects invalid transitions and leaves the order untouched", async () => {
    const { id } = await place();
    await expect(transitionOrder(db, id, "shipped", "staff@test")).rejects.toBeInstanceOf(OrderAdminError);
    expect((await db.query<{ status: string }>("select status from orders where id=$1", [id]))[0].status).toBe("pending_confirmation");
  });

  it("restocks exactly once when an order is cancelled", async () => {
    const before = await stock();
    const { id } = await place("Kamoki", 3);
    expect(await stock()).toBe(before - 3);
    await transitionOrder(db, id, "cancelled", "staff@test", "customer asked");
    expect(await stock()).toBe(before);
    await expect(transitionOrder(db, id, "cancelled", "staff@test")).rejects.toBeInstanceOf(OrderAdminError);
    expect(await stock()).toBe(before);
  });

  it("blocks confirming an order whose delivery fee is still unknown until staff set it", async () => {
    const { id } = await place("Gwadar", 1);
    await expect(transitionOrder(db, id, "confirmed", "staff@test")).rejects.toThrow(/delivery fee/);
    await setManualShippingFee(db, id, 450, "staff@test");
    const o = (await db.query<{ total: number; shipping_status: string }>("select total, shipping_status from orders where id=$1", [id]))[0];
    expect(o).toEqual({ total: 550, shipping_status: "quoted" });
    await transitionOrder(db, id, "confirmed", "staff@test");
  });

  it("refuses absurd manual fees", async () => {
    const { id } = await place("Gwadar", 1);
    await expect(setManualShippingFee(db, id, -5, "x")).rejects.toBeInstanceOf(OrderAdminError);
    await expect(setManualShippingFee(db, id, 1_000_000, "x")).rejects.toBeInstanceOf(OrderAdminError);
  });
});
