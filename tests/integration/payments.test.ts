import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/lib/db";
import { migrate } from "@/lib/db/migrate";
import { createOrder, CheckoutError } from "@/lib/orders/create-order";
import { gatewayStatuses, getPaymentOptions } from "@/lib/payments";

let db: Db;
let pid: string;
let n = 0;
const order = (paymentMethod: "cod" | "bank_transfer") =>
  createOrder(db, { customerName: "Pay Person", phone: "0300 1234567", city: "Kamoki", address: "House 1, Street 2", paymentMethod, idempotencyKey: `pay-key-${++n}-xxxxxxxxxxxxxxxx`, items: [{ productId: pid, quantity: 1 }] });
const setStore = (v: object) => db.query("insert into store_settings(key,value) values ('store',$1) on conflict (key) do update set value = excluded.value", [JSON.stringify(v)]);

beforeAll(async () => {
  db = await createPgliteDb();
  await migrate(db);
  await db.query("insert into store_settings(key,value) values ('shipping',$1)", [JSON.stringify({ version: "t", unlistedCity: "manual_confirmation", zones: [{ id: "l", label: "L", cities: ["Kamoki"], fee: 0, freeThreshold: null, codAvailable: true, etaDays: null }] })]);
  pid = (await db.query<{ id: string }>("insert into products(slug,name,price,stock,published) values ('p','P',100,50,true) returning id"))[0].id;
});
afterAll(() => db.close());

describe("payment methods", () => {
  it("both offline methods are on by default", async () => {
    expect(await getPaymentOptions(db)).toEqual({ cod: true, bankTransfer: true, online: [] });
    expect((await order("cod")).orderNumber).toMatch(/^FX-/);
    expect((await order("bank_transfer")).orderNumber).toMatch(/^FX-/);
  });

  it("a method the owner switched off cannot be used, even by a forged request, and stock is untouched", async () => {
    await setStore({ codEnabled: false });
    const before = (await db.query<{ stock: number }>("select stock from products where id=$1", [pid]))[0].stock;
    await expect(order("cod")).rejects.toMatchObject({ code: "payment_unavailable" });
    expect((await db.query<{ stock: number }>("select stock from products where id=$1", [pid]))[0].stock).toBe(before);
    await order("bank_transfer");
    await setStore({ codEnabled: true, bankTransferEnabled: false });
    await expect(order("bank_transfer")).rejects.toBeInstanceOf(CheckoutError);
    await order("cod");
  });

  it("new bank-transfer orders start unpaid and are never marked paid automatically", async () => {
    await setStore({});
    const o = await order("bank_transfer");
    const row = (await db.query<{ payment_status: string; payment_provider: string | null }>("select payment_status, payment_provider from orders where order_number=$1", [o.orderNumber]))[0];
    expect(row).toEqual({ payment_status: "unpaid", payment_provider: null });
  });
});

describe("online gateways", () => {
  const jc = { JAZZCASH_MERCHANT_ID: "x", JAZZCASH_PASSWORD: "x", JAZZCASH_INTEGRITY_SALT: "x" } as unknown as NodeJS.ProcessEnv;
  it("are never offered by credentials alone: they also need to be switched on and have a verified test payment", async () => {
    const g = await gatewayStatuses(db, jc);
    expect(g.find((x) => x.id === "jazzcash")).toMatchObject({ credentialsPresent: true, stage: "off", verified: false });
    expect(g.find((x) => x.id === "easypaisa")).toMatchObject({ credentialsPresent: false, stage: "not_built" });
    expect((await getPaymentOptions(db, { env: jc })).online).toEqual([]);
  });
});
