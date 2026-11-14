import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/lib/db";
import { migrate } from "@/lib/db/migrate";
import { createOrder } from "@/lib/orders/create-order";
import { PaymentProofError, submitReceipt } from "@/lib/orders/payment-proof";
import { getAdvanceConfig, saveAdvanceConfig } from "@/lib/payments/advance";
import { defaultAdvanceConfig } from "@/lib/domain/advance";
import { setManualShippingFee } from "@/lib/orders/admin";
import { createRepairInquiry, findRepairByToken, RepairError } from "@/lib/repairs/repairs";
import { findOrderByToken } from "@/lib/orders/lookup";

let db: Db;
let phone: string; let cable: string; let cat: string;
let n = 0;
const key = () => `exc-test-key-${++n}-${"x".repeat(10)}`;
const base = { customerName: "Test Customer", phone: "0300 1234567", city: "Kamoki", address: "Test street 1, Test area" };
const place = (items: { productId: string; quantity: number }[], extra: Record<string, unknown> = {}) => createOrder(db, { ...base, paymentMethod: "cod", idempotencyKey: key(), items, ...extra });
const CLOUD = "demo-cloud";
const url = (folder: string, id: string) => `https://res.cloudinary.com/${CLOUD}/image/upload/v1700000000/fixit/${folder}/${id}.jpg`;

beforeAll(async () => {
  db = await createPgliteDb();
  await migrate(db);
  await db.query("insert into store_settings(key,value) values ('shipping',$1)", [JSON.stringify({
    version: "t1", unlistedCity: "manual_confirmation",
    zones: [{ id: "local", label: "Local", cities: ["Kamoki"], fee: 0, freeThreshold: null, codAvailable: true, etaDays: [1, 1] }],
  })]);
  await db.query("insert into store_settings(key,value) values ('store',$1)", [JSON.stringify({ contactEmail: "shop@example.test" })]);
  cat = (await db.query<{ id: string }>("insert into categories(slug,name) values ('cables','Cables') returning id"))[0].id;
  phone = (await db.query<{ id: string }>("insert into products(slug,name,price,stock,published,sku) values ('ph','Phone',20000,100,true,'PH') returning id"))[0].id;
  cable = (await db.query<{ id: string }>("insert into products(slug,name,price,stock,published,sku,category_id) values ('cb','Cable',1000,100,true,'CB',$1) returning id", [cat]))[0].id;
});
afterAll(() => db.close());

describe("advance exceptions on real orders", () => {
  it("a phone needs half up front while a cable follows the general rule, and the order stores the amount", async () => {
    await saveAdvanceConfig(db, { ...defaultAdvanceConfig(), enabled: true, mode: "percent", bps: 3333, rules: [{ kind: "product", id: phone, label: "Phone", mode: "percent", bps: 5000, fixed: 500 }] });
    const only = await place([{ productId: phone, quantity: 1 }]);
    expect(only.advanceRequired).toBe(10_000);
    const mixed = await place([{ productId: phone, quantity: 1 }, { productId: cable, quantity: 1 }]);
    expect(mixed.advanceRequired).toBe(10_000 + 334); // half of 20,000 plus one third (rounded up) of 1,000
    const cableOnly = await place([{ productId: cable, quantity: 1 }]);
    expect(cableOnly.advanceRequired).toBe(334);
    const row = (await db.query<{ advance_required: number; advance_bps: number | null; total: number }>("select advance_required, advance_bps, total from orders where order_number = $1", [mixed.orderNumber]))[0];
    expect(row).toMatchObject({ advance_required: 10_334, advance_bps: null, total: 21_000 });
  });

  it("a category can be exempt, and the exception is saved in the same setting without losing the general rule", async () => {
    await saveAdvanceConfig(db, { ...defaultAdvanceConfig(), enabled: true, mode: "percent", bps: 3333, rules: [{ kind: "category", id: cat, label: "Cables", mode: "none", bps: 3333, fixed: 500 }] });
    expect((await place([{ productId: cable, quantity: 2 }])).advanceRequired).toBe(0);
    expect((await place([{ productId: phone, quantity: 1 }])).advanceRequired).toBe(6666);
    const stored = await getAdvanceConfig(db);
    expect(stored).toMatchObject({ enabled: true, bps: 3333 });
    expect(stored.rules).toHaveLength(1);
  });

  it("bank transfer orders never get an advance, whatever the exceptions say", async () => {
    await saveAdvanceConfig(db, { ...defaultAdvanceConfig(), rules: [{ kind: "product", id: phone, label: "Phone", mode: "percent", bps: 5000, fixed: 500 }] });
    expect((await place([{ productId: phone, quantity: 1 }], { paymentMethod: "bank_transfer" })).advanceRequired).toBe(0);
  });

  it("an advance fixed by an exception stays the same when staff later set the delivery fee", async () => {
    await saveAdvanceConfig(db, { ...defaultAdvanceConfig(), rules: [{ kind: "product", id: phone, label: "Phone", mode: "percent", bps: 5000, fixed: 500 }] });
    const o = await place([{ productId: phone, quantity: 1 }], { city: "Nowhereville" });
    const id = (await db.query<{ id: string }>("select id from orders where order_number = $1", [o.orderNumber]))[0].id;
    expect(o.advanceRequired).toBe(10_000);
    await setManualShippingFee(db, id, 300, "staff");
    expect((await db.query<{ advance_required: number; total: number }>("select advance_required, total from orders where id = $1", [id]))[0]).toMatchObject({ advance_required: 10_000, total: 20_300 });
  });
});

describe("receipt pictures on an order", () => {
  async function bankOrder() {
    const o = await place([{ productId: cable, quantity: 1 }], { paymentMethod: "bank_transfer" });
    return o as typeof o & { trackingToken: string };
  }
  const status = async (num: string) => (await db.query<{ payment_status: string; payment_receipts: string[] }>("select payment_status, payment_receipts from orders where order_number = $1", [num]))[0];

  it("saves the pictures, moves payment to pending for staff, and never marks anything paid", async () => {
    const o = await bankOrder();
    await submitReceipt(db, o.orderNumber, o.trackingToken, [url("receipts", "abcd1234")], CLOUD);
    expect(await status(o.orderNumber)).toEqual({ payment_status: "pending", payment_receipts: [url("receipts", "abcd1234")] });
    const alert = await db.query("select 1 from notification_outbox where dedupe_key like $1", [`%${o.orderNumber}-receipt-1%`]);
    expect(alert.length).toBeGreaterThan(0);
    expect((await findOrderByToken(db, o.orderNumber, o.trackingToken))?.receiptCount).toBe(1);
  });

  it("refuses links that are not the shop's own uploads, a wrong token, and more than three pictures", async () => {
    const o = await bankOrder();
    await expect(submitReceipt(db, o.orderNumber, o.trackingToken, ["https://evil.example/x.jpg"], CLOUD)).rejects.toBeInstanceOf(PaymentProofError);
    await expect(submitReceipt(db, o.orderNumber, o.trackingToken, [url("repairs", "abcd1234")], CLOUD)).rejects.toBeInstanceOf(PaymentProofError);
    await expect(submitReceipt(db, o.orderNumber, o.trackingToken, [url("receipts", "abcd1234")], undefined)).rejects.toBeInstanceOf(PaymentProofError);
    await expect(submitReceipt(db, o.orderNumber, "wrong-token", [url("receipts", "abcd1234")], CLOUD)).rejects.toThrow(/could not find/);
    await submitReceipt(db, o.orderNumber, o.trackingToken, [url("receipts", "aaaa1111"), url("receipts", "bbbb2222")], CLOUD);
    await submitReceipt(db, o.orderNumber, o.trackingToken, [url("receipts", "cccc3333")], CLOUD);
    await expect(submitReceipt(db, o.orderNumber, o.trackingToken, [url("receipts", "dddd4444")], CLOUD)).rejects.toThrow(/up to 3/);
    expect((await status(o.orderNumber)).payment_receipts).toHaveLength(3);
  });

  it("is refused for cash on delivery without an advance, and after the order is paid or cancelled", async () => {
    await saveAdvanceConfig(db, defaultAdvanceConfig());
    const cod = await place([{ productId: cable, quantity: 1 }]);
    await expect(submitReceipt(db, cod.orderNumber, cod.trackingToken!, [url("receipts", "abcd1234")], CLOUD)).rejects.toThrow(/not paid by transfer/);
    const o = await bankOrder();
    await db.query("update orders set payment_status = 'paid' where order_number = $1", [o.orderNumber]);
    await expect(submitReceipt(db, o.orderNumber, o.trackingToken, [url("receipts", "abcd1234")], CLOUD)).rejects.toThrow(/already marked as paid/);
    const c = await bankOrder();
    await db.query("update orders set status = 'cancelled' where order_number = $1", [c.orderNumber]);
    await expect(submitReceipt(db, c.orderNumber, c.trackingToken, [url("receipts", "abcd1234")], CLOUD)).rejects.toThrow(/cancelled/);
  });

  it("works for the advance on a cash-on-delivery order", async () => {
    await saveAdvanceConfig(db, { ...defaultAdvanceConfig(), enabled: true, mode: "percent", bps: 5000 });
    const o = await place([{ productId: cable, quantity: 1 }]);
    await submitReceipt(db, o.orderNumber, o.trackingToken!, [url("receipts", "abcd1234")], CLOUD);
    expect((await status(o.orderNumber)).payment_status).toBe("pending");
  });
});

describe("pictures on a repair request", () => {
  const input = { customerName: "Rita Repair", phone: "0300 1234567", deviceBrand: "Samsung", deviceModel: "A54", issue: "Cracked screen after a fall", preferredContact: "call" };

  it("saves up to three pictures and shows the customer only a count", async () => {
    const r = await createRepairInquiry(db, { ...input, photos: [url("repairs", "abcd1234"), url("repairs", "efgh5678")] }, { cloudName: CLOUD });
    const v = await findRepairByToken(db, r.reference, r.token);
    expect(v?.photoCount).toBe(2);
    expect(JSON.stringify(v)).not.toContain("res.cloudinary.com");
    const stored = (await db.query<{ photo_urls: string[] }>("select photo_urls from repair_inquiries where reference = $1", [r.reference]))[0];
    expect(stored.photo_urls).toEqual([url("repairs", "abcd1234"), url("repairs", "efgh5678")]);
  });

  it("works with no pictures, and refuses foreign links, receipts and too many", async () => {
    const none = await createRepairInquiry(db, input, { cloudName: CLOUD });
    expect((await findRepairByToken(db, none.reference, none.token))?.photoCount).toBe(0);
    await expect(createRepairInquiry(db, { ...input, photos: ["https://evil.example/a.jpg"] }, { cloudName: CLOUD })).rejects.toBeInstanceOf(RepairError);
    await expect(createRepairInquiry(db, { ...input, photos: [url("receipts", "abcd1234")] }, { cloudName: CLOUD })).rejects.toBeInstanceOf(RepairError);
    await expect(createRepairInquiry(db, { ...input, photos: [url("repairs", "abcd1234")] }, { cloudName: null })).rejects.toBeInstanceOf(RepairError);
    await expect(createRepairInquiry(db, { ...input, photos: [1, 2, 3, 4].map((i) => url("repairs", `abcd000${i}`)) }, { cloudName: CLOUD })).rejects.toThrow();
  });
});
