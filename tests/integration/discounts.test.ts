import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/lib/db";
import { migrate } from "@/lib/db/migrate";
import { createOrder } from "@/lib/orders/create-order";
import { transitionOrder } from "@/lib/orders/admin";
import { saleNowSql, saleTimerEndSql } from "@/lib/domain/sale";

let db: Db;
let cable: string; // Rs. 1,000, on sale at 800 (always on)
let plain: string; // Rs. 1,000, no sale, in category A
let caseItem: string; // Rs. 500, no sale, category B
let futureSale: string; // sale price starts tomorrow
let endedSale: string; // sale ended yesterday
let catA: string;
let catB: string;
let n = 0;
const key = () => `discount-test-key-${++n}-${"x".repeat(10)}`;
const base = { customerName: "Test Customer", phone: "0300 1234567", address: "Test street 1, Test area", paymentMethod: "cod" as const };

const place = (items: { productId: string; quantity: number }[], extra: Record<string, unknown> = {}) =>
  createOrder(db, { ...base, city: "Kamoki", idempotencyKey: key(), items, ...extra });
const total = async (num: string) => (await db.query<{ total: number; discount: number; coupon_code: string | null }>("select total, discount, coupon_code from orders where order_number = $1", [num]))[0];
const code = async (c: string, extra = "") => { await db.query(`insert into coupons(code,type,value,min_subtotal${extra ? "," + extra.split("|")[0] : ""}) values ('${c}','percent',10,0${extra ? "," + extra.split("|")[1] : ""})`); };

beforeAll(async () => {
  db = await createPgliteDb();
  await migrate(db);
  await db.query("insert into store_settings(key,value) values ('shipping',$1)", [JSON.stringify({
    version: "t1", unlistedCity: "manual_confirmation",
    zones: [{ id: "pk", label: "PK", cities: ["Kamoki", "Lahore"], fee: 300, freeThreshold: null, codAvailable: true, etaDays: [1, 3] }],
  })]);
  catA = (await db.query<{ id: string }>("insert into categories(slug,name) values ('cat-a','A') returning id"))[0].id;
  catB = (await db.query<{ id: string }>("insert into categories(slug,name) values ('cat-b','B') returning id"))[0].id;
  const ins = async (slug: string, price: number, sale: number | null, cat: string, window = "null,null") =>
    (await db.query<{ id: string }>(`insert into products(slug,name,price,sale_price,stock,published,sku,category_id,sale_starts_at,sale_ends_at) values ($1,$1,$2,$3,100,true,$1,$4,${window}) returning id`, [slug, price, sale, cat]))[0].id;
  cable = await ins("sale-cable", 1000, 800, catA);
  plain = await ins("plain-a", 1000, null, catA);
  caseItem = await ins("case-b", 500, null, catB);
  futureSale = await ins("future-sale", 1000, 600, catA, `now() + interval '1 day', null`);
  endedSale = await ins("ended-sale", 1000, 600, catA, `null, now() - interval '1 day'`);
});
afterAll(() => db.close());

describe("sale windows", () => {
  it("a sale that has not started, or has ended, sells at the regular price", async () => {
    const o = await place([{ productId: futureSale, quantity: 1 }, { productId: endedSale, quantity: 1 }]);
    expect(o.total).toBe(2000 + 300); // two regular-price items plus delivery, never the sale price
  });

  it("the window is enforced by the database query, not by display code", async () => {
    const rows = await db.query<{ slug: string; s: number | null }>(`select slug, ${saleNowSql("p")} as s from products p order by slug`);
    const by = Object.fromEntries(rows.map((r) => [r.slug, r.s]));
    expect(by["sale-cable"]).toBe(800);
    expect(by["future-sale"]).toBeNull();
    expect(by["ended-sale"]).toBeNull();
  });

  it("the countdown shows only for a running sale whose timer is switched on, and a lapsed sale sells at the regular price", async () => {
    const mk = async (slug: string, timer: boolean, window: string) =>
      (await db.query<{ id: string }>(`insert into products(slug,name,price,sale_price,stock,published,sku,sale_timer,sale_starts_at,sale_ends_at) values ($1,$1,1000,700,50,true,$1,$2,${window}) returning id`, [slug, timer]))[0].id;
    const live = await mk("timer-live", true, "now() - interval '1 hour', now() + interval '2 days'");
    await mk("timer-off", false, "now() - interval '1 hour', now() + interval '2 days'");
    const lapsed = await mk("timer-lapsed", true, "now() - interval '3 days', now() - interval '1 second'");
    const rows = await db.query<{ slug: string; s: number | null; t: Date | null }>(`select slug, ${saleNowSql("p")} as s, ${saleTimerEndSql("p")} as t from products p where slug like 'timer-%'`);
    const by = Object.fromEntries(rows.map((r) => [r.slug, r]));
    expect(by["timer-live"].t).not.toBeNull();
    expect(by["timer-off"].s).toBe(700);
    expect(by["timer-off"].t).toBeNull();
    expect(by["timer-lapsed"].s).toBeNull();
    expect(by["timer-lapsed"].t).toBeNull();
    // Checkout also follows the clock: the lapsed one is charged in full even though its timer flag is still on.
    const o = await place([{ productId: live, quantity: 1 }, { productId: lapsed, quantity: 1 }]);
    expect(o.total).toBe(700 + 1000 + 300);
  });

  it("rejects an end date before the start date", async () => {
    await expect(db.query("update products set sale_starts_at = now(), sale_ends_at = now() - interval '1 hour' where slug = 'plain-a'")).rejects.toThrow();
  });
});

describe("coupons", () => {
  it("stacks with a sale price by default: sale savings first, then the coupon on the sale price", async () => {
    await code("STACK10");
    const o = await place([{ productId: cable, quantity: 1 }], { couponCode: "stack10" });
    expect(await total(o.orderNumber)).toMatchObject({ discount: 80, total: 800 - 80 + 300 });
  });

  it("can be switched to refuse sale items", async () => {
    await code("NOSALE", "allow_with_sale|false");
    await expect(place([{ productId: cable, quantity: 1 }], { couponCode: "NOSALE" })).rejects.toThrow(/sale prices/);
    const ok = await place([{ productId: plain, quantity: 1 }], { couponCode: "NOSALE" });
    expect((await total(ok.orderNumber)).discount).toBe(100);
  });

  it("rejects a coupon that has not started, or has expired", async () => {
    await code("LATER", "starts_at|now() + interval '1 day'");
    await code("GONE", "expires_at|now() - interval '1 day'");
    await expect(place([{ productId: plain, quantity: 1 }], { couponCode: "LATER" })).rejects.toThrow(/not active yet/);
    await expect(place([{ productId: plain, quantity: 1 }], { couponCode: "GONE" })).rejects.toThrow(/expired/);
  });

  it("enforces the overall usage limit and gives the use back when an order is cancelled", async () => {
    await code("ONCE", "usage_limit|1");
    const a = await place([{ productId: plain, quantity: 1 }], { couponCode: "ONCE" });
    await expect(place([{ productId: plain, quantity: 1 }], { couponCode: "ONCE" })).rejects.toThrow(/fully used/);
    const id = (await db.query<{ id: string }>("select id from orders where order_number = $1", [a.orderNumber]))[0].id;
    await transitionOrder(db, id, "cancelled", "staff");
    const b = await place([{ productId: plain, quantity: 1 }], { couponCode: "ONCE" });
    expect((await total(b.orderNumber)).coupon_code).toBe("ONCE");
  });

  it("a refused coupon never consumes a use or stock", async () => {
    await db.query("insert into coupons(code,type,value,min_subtotal,usage_limit) values ('MIN5K','percent',10,5000,5)");
    const stockBefore = (await db.query<{ stock: number }>("select stock from products where id = $1", [plain]))[0].stock;
    await expect(place([{ productId: plain, quantity: 1 }], { couponCode: "MIN5K" })).rejects.toThrow(/at least/);
    expect((await db.query<{ used_count: number }>("select used_count from coupons where code = 'MIN5K'"))[0].used_count).toBe(0);
    expect((await db.query<{ stock: number }>("select stock from products where id = $1", [plain]))[0].stock).toBe(stockBefore); // the whole order rolled back
  });

  it("enforces a per-customer limit by phone number, but another customer can still use it", async () => {
    await code("ONEEACH", "per_customer_limit|1");
    await place([{ productId: plain, quantity: 1 }], { couponCode: "ONEEACH" });
    await expect(place([{ productId: plain, quantity: 1 }], { couponCode: "ONEEACH", phone: "0300-1234567" })).rejects.toThrow(/already used/);
    const other = await place([{ productId: plain, quantity: 1 }], { couponCode: "ONEEACH", phone: "0311 7654321" });
    expect((await total(other.orderNumber)).discount).toBe(100);
  });

  it("a category coupon discounts only the matching items", async () => {
    await db.query("insert into coupons(code,type,value,min_subtotal,category_id) values ('CATA','percent',50,0,$1)", [catA]);
    const o = await place([{ productId: plain, quantity: 1 }, { productId: caseItem, quantity: 1 }], { couponCode: "CATA" });
    expect((await total(o.orderNumber)).discount).toBe(500); // 50% of the Rs. 1,000 in category A only, not of the Rs. 500 case
    await expect(place([{ productId: caseItem, quantity: 1 }], { couponCode: "CATA" })).rejects.toThrow(/does not apply/);
  });

  it("a free-delivery coupon removes the delivery fee and nothing else", async () => {
    await db.query("insert into coupons(code,type,value,min_subtotal) values ('FREESHIP','freeship',1,500)");
    const o = await place([{ productId: plain, quantity: 1 }], { couponCode: "FREESHIP" });
    expect(await total(o.orderNumber)).toMatchObject({ discount: 300, total: 1000 });
    await expect(place([{ productId: caseItem, quantity: 1 }], { couponCode: "FREESHIP" })).resolves.toBeTruthy(); // Rs. 500 meets the minimum
    await db.query("update coupons set min_subtotal = 5000 where code = 'FREESHIP'");
    await expect(place([{ productId: plain, quantity: 1 }], { couponCode: "FREESHIP" })).rejects.toThrow(/at least/);
  });

  it("an unknown or disabled code is refused with a clear message", async () => {
    await expect(place([{ productId: plain, quantity: 1 }], { couponCode: "NOPE" })).rejects.toThrow(/not valid/);
    await code("OFF");
    await db.query("update coupons set active = false where code = 'OFF'");
    await expect(place([{ productId: plain, quantity: 1 }], { couponCode: "OFF" })).rejects.toThrow(/not valid/);
  });

  it("a browser cannot send its own price or discount", async () => {
    const o = await place([{ productId: plain, quantity: 1 }], { unitPrice: 1, discount: 999, total: 1 });
    expect((await total(o.orderNumber)).total).toBe(1300);
  });
});
