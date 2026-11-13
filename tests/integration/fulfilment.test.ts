import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/lib/db";
import { migrate } from "@/lib/db/migrate";
import { createOrder } from "@/lib/orders/create-order";
import { addOrderNote, OrderAdminError, receivedAmount, recordBalanceCollected, recordRefund, setDispatchDetails, setPaymentStatus, transitionOrder, verifyAdvance } from "@/lib/orders/admin";
import { saveAdvanceConfig } from "@/lib/payments/advance";
import { defaultAdvanceConfig } from "@/lib/domain/advance";
import { renderOrderEmail } from "@/lib/email/templates";
import { canTransition, nextStatuses } from "@/lib/domain/order-state";

let db: Db;
let item: string; // Rs. 3,000, free local delivery
let n = 0;
const key = () => `fulfil-test-key-${++n}-${"x".repeat(10)}`;
const base = { customerName: "Fulfil Person", phone: "0300 1234567", email: "buyer@example.test", city: "Kamoki", address: "Test street 1, Test area" };

interface Row { id: string; status: string; payment_method: string; payment_status: string; total: number; advance_paid: number; balance_collected: number; refunded_amount: number; carrier: string | null; tracking_number: string | null; dispatched_at: string | null }
const place = async (paymentMethod: "cod" | "bank_transfer") => {
  const o = await createOrder(db, { ...base, paymentMethod, idempotencyKey: key(), items: [{ productId: item, quantity: 1 }] });
  return (await db.query<Row>("select * from orders where order_number = $1", [o.orderNumber]))[0];
};
const get = async (id: string) => (await db.query<Row>("select * from orders where id = $1", [id]))[0];
const walk = async (id: string, path: string[]) => { for (const s of path) await transitionOrder(db, id, s as never, "staff@test"); };

beforeAll(async () => {
  db = await createPgliteDb();
  await migrate(db);
  await db.query("insert into store_settings(key,value) values ('shipping',$1)", [JSON.stringify({
    version: "t", unlistedCity: "manual_confirmation",
    zones: [{ id: "l", label: "L", cities: ["Kamoki"], fee: 0, freeThreshold: null, codAvailable: true, etaDays: [1, 1] }],
  })]);
  item = (await db.query<{ id: string }>("insert into products(slug,name,price,stock,published,sku) values ('f','F',3000,500,true,'F') returning id"))[0].id;
});
afterAll(() => db.close());

describe("order stages", () => {
  it("allows the optional packed and out-for-delivery stages but also the short path", () => {
    expect(canTransition("processing", "packed")).toBe(true);
    expect(canTransition("packed", "shipped")).toBe(true);
    expect(canTransition("shipped", "out_for_delivery")).toBe(true);
    expect(canTransition("out_for_delivery", "delivered")).toBe(true);
    expect(canTransition("processing", "shipped")).toBe(true); // stages can be skipped
    expect(canTransition("packed", "delivered")).toBe(false); // but not jumped over the courier
    expect(canTransition("pending_confirmation", "packed")).toBe(false);
    expect(nextStatuses("delivered")).toEqual(["return_requested"]);
  });

  it("walks a COD order through every stage and stamps the dispatch time once", async () => {
    const o = await place("cod");
    await walk(o.id, ["confirmed", "processing", "packed", "shipped"]);
    const shipped = await get(o.id);
    expect(shipped.dispatched_at).toBeTruthy();
    await walk(o.id, ["out_for_delivery", "delivered"]);
    expect((await get(o.id)).dispatched_at).toEqual(shipped.dispatched_at);
  });

  it("will not confirm an order that must be paid first until the payment is verified", async () => {
    const o = await place("bank_transfer");
    await expect(transitionOrder(db, o.id, "confirmed", "staff@test")).rejects.toThrow(/mark it paid/);
    await setPaymentStatus(db, o.id, "paid", "staff@test");
    await transitionOrder(db, o.id, "confirmed", "staff@test");
    expect((await get(o.id)).status).toBe("confirmed");
  });
});

describe("courier and notes", () => {
  it("saves courier details, refuses a tracking number with no courier, and refuses closed orders", async () => {
    const o = await place("cod");
    await setDispatchDetails(db, o.id, "  TCS ", " 123-456 ", "s");
    expect(await get(o.id)).toMatchObject({ carrier: "TCS", tracking_number: "123-456" });
    await expect(setDispatchDetails(db, o.id, "", "999", "s")).rejects.toThrow(/courier name/);
    await transitionOrder(db, o.id, "cancelled", "s");
    await expect(setDispatchDetails(db, o.id, "TCS", "1", "s")).rejects.toThrow(/closed/);
  });

  it("the dispatch email carries the courier and what to pay on delivery", async () => {
    const mail = renderOrderEmail("order_shipped", {
      orderNumber: "FX-1", customerName: "A B", status: "shipped", paymentMethod: "cod", subtotal: 3000, discount: 0, shippingFee: 0, shippingStatus: "quoted", total: 3000,
      advancePaid: 1000, carrier: "TCS", trackingNumber: "T-9", items: [{ name: "X", quantity: 1, lineTotal: 3000 }],
    }, { baseUrl: "https://fixit-kamoke.vercel.app", shopName: "Fixit" } as never);
    expect(mail?.text).toContain("Courier: TCS, tracking number: T-9");
    expect(mail?.text).toContain("Rs. 2,000 ready to pay on delivery");
  });

  it("stores staff notes with their author", async () => {
    const o = await place("cod");
    await addOrderNote(db, o.id, "  Call before delivery ", "staff@test");
    const rows = await db.query<{ author: string; body: string }>("select author, body from order_notes where order_id = $1", [o.id]);
    expect(rows).toEqual([{ author: "staff@test", body: "Call before delivery" }]);
    await expect(addOrderNote(db, o.id, "   ", "s")).rejects.toThrow(OrderAdminError);
  });
});

describe("cash on delivery collection and refunds", () => {
  it("records the exact balance after delivery only, once, and marks the order paid", async () => {
    await saveAdvanceConfig(db, { ...defaultAdvanceConfig(), enabled: true, mode: "percent", bps: 3333 });
    const o = await place("cod");
    await verifyAdvance(db, o.id, 1000, "s");
    await walk(o.id, ["confirmed", "processing", "shipped"]);
    await expect(recordBalanceCollected(db, o.id, 2000, "s")).rejects.toThrow(/delivered first/);
    await walk(o.id, ["delivered"]);
    await expect(recordBalanceCollected(db, o.id, 1500, "s")).rejects.toThrow(/does not match/);
    await expect(recordBalanceCollected(db, o.id, 3000, "s")).rejects.toThrow(/does not match/);
    await recordBalanceCollected(db, o.id, 2000, "staff@test");
    expect(await get(o.id)).toMatchObject({ payment_status: "paid", balance_collected: 2000 });
    await expect(recordBalanceCollected(db, o.id, 2000, "s")).rejects.toThrow(/already recorded/);
    expect(receivedAmount(await get(o.id))).toBe(3000);
  });

  it("only cash-on-delivery orders have a balance", async () => {
    const o = await place("bank_transfer");
    await expect(recordBalanceCollected(db, o.id, 3000, "s")).rejects.toThrow(/Only cash-on-delivery/);
  });

  it("refunds an advance-only cancellation exactly: partial, then full, never more than received", async () => {
    await saveAdvanceConfig(db, { ...defaultAdvanceConfig(), enabled: true, mode: "percent", bps: 3333 });
    const o = await place("cod");
    await expect(recordRefund(db, o.id, 100, "s")).rejects.toThrow(/nothing to refund/);
    await verifyAdvance(db, o.id, 1000, "s");
    await transitionOrder(db, o.id, "cancelled", "s");
    expect(receivedAmount(await get(o.id))).toBe(1000);
    await recordRefund(db, o.id, 400, "staff@test", "partly");
    expect(await get(o.id)).toMatchObject({ payment_status: "partially_refunded", refunded_amount: 400 });
    await expect(recordRefund(db, o.id, 700, "s")).rejects.toThrow(/Only Rs\. 600/);
    await recordRefund(db, o.id, 600, "s");
    expect(await get(o.id)).toMatchObject({ payment_status: "refunded", refunded_amount: 1000 });
    await expect(recordRefund(db, o.id, 1, "s")).rejects.toThrow(/Only Rs\. 0/);
  });

  it("refunds a fully paid transfer order and queues one email per refund total", async () => {
    const o = await place("bank_transfer");
    await setPaymentStatus(db, o.id, "paid", "s");
    await recordRefund(db, o.id, 3000, "s");
    expect(await get(o.id)).toMatchObject({ payment_status: "refunded", refunded_amount: 3000 });
    const mails = await db.query<{ kind: string }>("select kind from notification_outbox where kind = 'order_refunded'");
    expect(mails.length).toBeGreaterThanOrEqual(1);
  });

  it("rejects non-whole or non-positive refund amounts", async () => {
    const o = await place("bank_transfer");
    await setPaymentStatus(db, o.id, "paid", "s");
    await expect(recordRefund(db, o.id, 0, "s")).rejects.toThrow(OrderAdminError);
    await expect(recordRefund(db, o.id, 10.5, "s")).rejects.toThrow(OrderAdminError);
    await expect(recordRefund(db, o.id, -5, "s")).rejects.toThrow(OrderAdminError);
  });
});
