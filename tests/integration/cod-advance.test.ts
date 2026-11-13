import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/lib/db";
import { migrate } from "@/lib/db/migrate";
import { createOrder } from "@/lib/orders/create-order";
import { OrderAdminError, setManualShippingFee, transitionOrder, verifyAdvance } from "@/lib/orders/admin";
import { PaymentProofError, submitTransferReference } from "@/lib/orders/payment-proof";
import { saveAdvanceConfig } from "@/lib/payments/advance";
import { defaultAdvanceConfig } from "@/lib/domain/advance";

let db: Db;
let item: string; // Rs. 3,000, free local delivery -> total 3,000
let n = 0;
const key = () => `advance-test-key-${++n}-${"x".repeat(10)}`;
const base = { customerName: "Test Customer", phone: "0300 1234567", city: "Kamoki", address: "Test street 1, Test area", paymentMethod: "cod" as const };

const place = (extra: Record<string, unknown> = {}) => createOrder(db, { ...base, idempotencyKey: key(), items: [{ productId: item, quantity: 1 }], ...extra });
interface Row { id: string; status: string; total: number; advance_required: number; advance_paid: number; advance_bps: number | null; payment_status: string; payment_reference: string | null; advance_verified_by: string | null; advance_verified_at: string | null }
const row = async (num: string) => (await db.query<Row>("select * from orders where order_number = $1", [num]))[0];

beforeAll(async () => {
  db = await createPgliteDb();
  await migrate(db);
  await db.query("insert into store_settings(key,value) values ('shipping',$1)", [JSON.stringify({
    version: "t1", unlistedCity: "manual_confirmation",
    zones: [{ id: "local", label: "Local", cities: ["Kamoki"], fee: 0, freeThreshold: null, codAvailable: true, etaDays: [1, 1] }],
  })]);
  item = (await db.query<{ id: string }>("insert into products(slug,name,price,stock,published,sku) values ('adv-item','Adv item',3000,100,true,'ADV') returning id"))[0].id;
});
afterAll(() => db.close());

describe("cash on delivery advance", () => {
  it("existing behaviour is unchanged while the rule is off: no advance, orders confirm normally", async () => {
    const o = await place();
    expect(o.advanceRequired).toBe(0);
    const r = await row(o.orderNumber);
    expect(r.advance_required).toBe(0);
    await transitionOrder(db, r.id, "confirmed", "staff@test");
    expect((await row(o.orderNumber)).status).toBe("confirmed");
  });

  it("one-third rule: Rs. 3,000 order needs Rs. 1,000 now, Rs. 2,000 on delivery", async () => {
    await saveAdvanceConfig(db, { ...defaultAdvanceConfig(), enabled: true, mode: "percent", bps: 3333 });
    const o = await place();
    expect(o.advanceRequired).toBe(1000);
    const r = await row(o.orderNumber);
    expect(r).toMatchObject({ advance_required: 1000, advance_bps: 3333, advance_paid: 0, total: 3000, payment_status: "unpaid", status: "pending_confirmation" });
  });

  it("is not applied to bank transfer orders, and a changed rule never rewrites older orders", async () => {
    const before = await place();
    await saveAdvanceConfig(db, { ...defaultAdvanceConfig(), enabled: true, mode: "percent", bps: 5000 });
    const bank = await place({ paymentMethod: "bank_transfer" });
    expect(bank.advanceRequired).toBe(0);
    expect((await row(before.orderNumber)).advance_required).toBe(1000); // still the old one-third
    const half = await place();
    expect(half.advanceRequired).toBe(1500);
    await saveAdvanceConfig(db, { ...defaultAdvanceConfig(), enabled: true, mode: "percent", bps: 3333 });
  });

  it("cannot be confirmed until the advance is verified, and verification records amount, person and time", async () => {
    const o = await place();
    const r = await row(o.orderNumber);
    await expect(transitionOrder(db, r.id, "confirmed", "staff@test")).rejects.toThrow(/advance/i);
    await verifyAdvance(db, r.id, 1000, "staff@test");
    const v = await row(o.orderNumber);
    expect(v).toMatchObject({ advance_paid: 1000, payment_status: "partial", advance_verified_by: "staff@test" });
    expect(v.advance_verified_at).toBeTruthy();
    await transitionOrder(db, r.id, "confirmed", "staff@test");
    expect((await row(o.orderNumber)).status).toBe("confirmed");
  });

  it("verification rejects too little, too much, nonsense and repeats", async () => {
    const o = await place();
    const { id } = await row(o.orderNumber);
    await expect(verifyAdvance(db, id, 400, "s")).rejects.toThrow(OrderAdminError);
    await expect(verifyAdvance(db, id, 3001, "s")).rejects.toThrow(/more than/);
    await expect(verifyAdvance(db, id, 0, "s")).rejects.toThrow(OrderAdminError);
    await expect(verifyAdvance(db, id, 10.5, "s")).rejects.toThrow(OrderAdminError);
    await verifyAdvance(db, id, 1000, "s");
    await expect(verifyAdvance(db, id, 1000, "s")).rejects.toThrow(/already/);
    expect((await row(o.orderNumber)).advance_paid).toBe(1000); // a repeat never double counts
  });

  it("paying the whole total as the advance marks it paid", async () => {
    const o = await place();
    const { id } = await row(o.orderNumber);
    await verifyAdvance(db, id, 3000, "s");
    expect((await row(o.orderNumber)).payment_status).toBe("paid");
  });

  it("a customer can send a transaction reference for the advance; it never marks anything paid", async () => {
    const o = await place();
    await submitTransferReference(db, o.orderNumber, o.trackingToken!, "TXN-12345");
    const r = await row(o.orderNumber);
    expect(r).toMatchObject({ payment_reference: "TXN-12345", payment_status: "pending", advance_paid: 0 });
    await expect(transitionOrder(db, r.id, "confirmed", "s")).rejects.toThrow(/advance/i);
    await verifyAdvance(db, r.id, 1000, "s");
    await expect(submitTransferReference(db, o.orderNumber, o.trackingToken!, "TXN-99999")).rejects.toThrow(PaymentProofError);
  });

  it("a plain COD order with no advance still refuses a payment reference", async () => {
    await saveAdvanceConfig(db, { ...defaultAdvanceConfig(), enabled: false });
    const o = await place();
    await expect(submitTransferReference(db, o.orderNumber, o.trackingToken!, "TXN-12345")).rejects.toThrow(/not paid by transfer/);
    await saveAdvanceConfig(db, { ...defaultAdvanceConfig(), enabled: true, mode: "percent", bps: 3333 });
  });

  it("verification does not run on cancelled orders or orders without an advance", async () => {
    const o = await place();
    const { id } = await row(o.orderNumber);
    await transitionOrder(db, id, "cancelled", "s");
    await expect(verifyAdvance(db, id, 1000, "s")).rejects.toThrow(/closed/);
    const bank = await place({ paymentMethod: "bank_transfer" });
    await expect(verifyAdvance(db, (await row(bank.orderNumber)).id, 1000, "s")).rejects.toThrow(/does not need/);
  });

  it("the browser cannot choose the advance: extra fields are ignored", async () => {
    const o = await place({ advanceRequired: 1, advance: 1 });
    expect(o.advanceRequired).toBe(1000);
  });

  it("an idempotent retry returns the same advance and creates no second order", async () => {
    const k = key();
    const a = await createOrder(db, { ...base, idempotencyKey: k, items: [{ productId: item, quantity: 1 }] });
    const b = await createOrder(db, { ...base, idempotencyKey: k, items: [{ productId: item, quantity: 1 }] });
    expect(b.duplicate).toBe(true);
    expect(b.advanceRequired).toBe(a.advanceRequired);
  });

  it("a delivery fee set later recalculates the advance from the new total", async () => {
    const o = await place({ city: "Unknownville" }); // unlisted city: fee to be confirmed
    const { id, total } = await row(o.orderNumber);
    expect(total).toBe(3000);
    await setManualShippingFee(db, id, 300, "s");
    expect(await row(o.orderNumber)).toMatchObject({ total: 3300, advance_required: 1100 }); // one third of 3,300
  });

  it("a delivery fee set later never changes the terms an order was placed under", async () => {
    // Placed while the rule was OFF: setting the fee afterwards must not impose an advance, even though the rule is on now.
    await saveAdvanceConfig(db, { ...defaultAdvanceConfig(), enabled: false });
    const plain = await place({ city: "Unknownville" });
    await saveAdvanceConfig(db, { ...defaultAdvanceConfig(), enabled: true, mode: "percent", bps: 5000 });
    await setManualShippingFee(db, (await row(plain.orderNumber)).id, 300, "s");
    expect(await row(plain.orderNumber)).toMatchObject({ total: 3300, advance_required: 0 });

    // Placed at one third, advance already verified: a fee raises the balance on delivery, not the advance, so it cannot get stuck.
    await saveAdvanceConfig(db, { ...defaultAdvanceConfig(), enabled: true, mode: "percent", bps: 3333 });
    const paid = await place({ city: "Unknownville" });
    const { id } = await row(paid.orderNumber);
    await verifyAdvance(db, id, 1000, "s");
    await setManualShippingFee(db, id, 300, "s");
    expect(await row(paid.orderNumber)).toMatchObject({ total: 3300, advance_required: 1000, advance_paid: 1000 });
    await transitionOrder(db, id, "confirmed", "s"); // not blocked

    // A percentage keeps its own percentage even if the owner changed the rule to half in the meantime.
    await saveAdvanceConfig(db, { ...defaultAdvanceConfig(), enabled: true, mode: "percent", bps: 3333 });
    const third = await place({ city: "Unknownville" });
    await saveAdvanceConfig(db, { ...defaultAdvanceConfig(), enabled: true, mode: "percent", bps: 5000 });
    await setManualShippingFee(db, (await row(third.orderNumber)).id, 300, "s");
    expect(await row(third.orderNumber)).toMatchObject({ total: 3300, advance_required: 1100 });
    await saveAdvanceConfig(db, { ...defaultAdvanceConfig(), enabled: true, mode: "percent", bps: 3333 });
  });

  it("applies the advance to the final total after a coupon and respects the minimum order", async () => {
    await db.query("insert into coupons(code,type,value,min_subtotal) values ('TEN','percent',10,0)");
    const o = await place({ couponCode: "TEN" });
    expect(await row(o.orderNumber)).toMatchObject({ total: 2700, advance_required: 900 });
    await saveAdvanceConfig(db, { ...defaultAdvanceConfig(), enabled: true, mode: "percent", bps: 3333, minOrder: 5000 });
    expect((await place()).advanceRequired).toBe(0);
    await saveAdvanceConfig(db, { ...defaultAdvanceConfig(), enabled: true, mode: "percent", bps: 3333 });
  });

  it("a delivery zone can switch the advance off for its cities only", async () => {
    await db.query("update store_settings set value = $1 where key = 'shipping'", [JSON.stringify({
      version: "t2", unlistedCity: "manual_confirmation",
      zones: [
        { id: "local", label: "Local", cities: ["Kamoki"], fee: 0, freeThreshold: null, codAvailable: true, etaDays: [1, 1], active: true, advance: false },
        { id: "pk", label: "PK", cities: ["Lahore"], fee: 300, freeThreshold: null, codAvailable: true, etaDays: [2, 3], active: true, advance: true },
      ],
    })]);
    expect((await place()).advanceRequired).toBe(0); // Kamoki: advance switched off
    expect((await place({ city: "Lahore" })).advanceRequired).toBe(1100); // Lahore: one third of 3,300
  });

  it("the database refuses an advance larger than the total", async () => {
    const o = await place();
    await expect(db.query("update orders set advance_required = total + 1 where order_number = $1", [o.orderNumber])).rejects.toThrow();
  });
});
