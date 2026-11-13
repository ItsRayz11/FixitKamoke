import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/lib/db";
import { migrate } from "@/lib/db/migrate";
import { CheckoutError, createOrder } from "@/lib/orders/create-order";
import { submitTransferReference } from "@/lib/orders/payment-proof";
import { getPaymentOptions } from "@/lib/payments";
import { isManualMethod, paymentLabel } from "@/lib/domain/payment-label";
import { storeSettingsSchema } from "@/lib/settings";

let db: Db;
let item: string;
let n = 0;
const key = () => `wallet-test-key-${++n}-${"x".repeat(10)}`;
const base = { customerName: "Wallet Person", phone: "0300 1234567", city: "Kamoki", address: "Test street 1, Test area" };
const setStore = (v: Record<string, unknown>) =>
  db.query("insert into store_settings(key,value) values ('store',$1) on conflict (key) do update set value = excluded.value", [JSON.stringify(v)]);
const place = (paymentMethod: string) => createOrder(db, { ...base, paymentMethod, idempotencyKey: key(), items: [{ productId: item, quantity: 1 }] });

beforeAll(async () => {
  db = await createPgliteDb();
  await migrate(db);
  await db.query("insert into store_settings(key,value) values ('shipping',$1)", [JSON.stringify({
    version: "t", unlistedCity: "manual_confirmation",
    zones: [{ id: "l", label: "L", cities: ["Kamoki"], fee: 0, freeThreshold: null, codAvailable: true, etaDays: [1, 1] }],
  })]);
  item = (await db.query<{ id: string }>("insert into products(slug,name,price,stock,published,sku) values ('w','W',1000,50,true,'W') returning id"))[0].id;
});
afterAll(() => db.close());

describe("manual wallet payments", () => {
  it("are not offered until switched on AND a number is saved", async () => {
    await setStore({ jazzcashEnabled: true });
    expect((await getPaymentOptions(db)).wallets).toEqual([]);
    await setStore({ jazzcashEnabled: true, jazzcashNumber: "0300 1112223" });
    expect((await getPaymentOptions(db)).wallets).toEqual(["jazzcash_manual"]);
    await setStore({ jazzcashEnabled: false, jazzcashNumber: "0300 1112223", easypaisaEnabled: true, easypaisaNumber: "0311 4445556" });
    expect((await getPaymentOptions(db)).wallets).toEqual(["easypaisa_manual"]);
  });

  it("an order cannot use a wallet that is off", async () => {
    await setStore({ jazzcashEnabled: false, jazzcashNumber: "0300 1112223" });
    await expect(place("jazzcash_manual")).rejects.toThrow(CheckoutError);
    await expect(place("easypaisa_manual")).rejects.toThrow(/not available/);
  });

  it("creates an unpaid order that waits for staff to check the money, and accepts a transaction reference", async () => {
    await setStore({ jazzcashEnabled: true, jazzcashNumber: "0300 1112223" });
    const o = await place("jazzcash_manual");
    const r = (await db.query<{ payment_method: string; payment_status: string; status: string }>(
      "select payment_method, payment_status, status from orders where order_number = $1", [o.orderNumber]))[0];
    expect(r).toEqual({ payment_method: "jazzcash_manual", payment_status: "unpaid", status: "pending_confirmation" });
    await submitTransferReference(db, o.orderNumber, o.trackingToken!, "JC-998877");
    const after = (await db.query<{ payment_status: string; payment_reference: string }>(
      "select payment_status, payment_reference from orders where order_number = $1", [o.orderNumber]))[0];
    expect(after).toEqual({ payment_status: "pending", payment_reference: "JC-998877" }); // pending, never paid
  });

  it("labels and the manual family are consistent", () => {
    expect(paymentLabel("jazzcash_manual")).toBe("JazzCash transfer");
    expect(paymentLabel("easypaisa_manual")).toBe("Easypaisa transfer");
    expect(isManualMethod("bank_transfer") && isManualMethod("jazzcash_manual") && isManualMethod("easypaisa_manual")).toBe(true);
    expect(isManualMethod("cod") || isManualMethod("online")).toBe(false);
  });

  it("an unknown method is rejected by validation", async () => {
    await expect(place("bitcoin")).rejects.toThrow();
  });

  it("wallet settings are optional in the settings schema so older saved settings stay valid", () => {
    expect(storeSettingsSchema.shape.jazzcashNumber.isOptional()).toBe(true);
    expect(storeSettingsSchema.shape.easypaisaEnabled.isOptional()).toBe(true);
  });
});
