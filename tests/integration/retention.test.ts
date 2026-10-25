import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/lib/db";
import { migrate } from "@/lib/db/migrate";
import { createOrder } from "@/lib/orders/create-order";
import { activeSubscribers, csvCell, MarketingError, subscribe, unsubscribe } from "@/lib/marketing";
import { recordEvent } from "@/lib/events";

let db: Db;
beforeAll(async () => {
  db = await createPgliteDb();
  await migrate(db);
  await db.query("insert into store_settings(key,value) values ('shipping',$1)", [JSON.stringify({ version: "t", unlistedCity: "manual_confirmation", zones: [{ id: "l", label: "L", cities: ["Kamoki"], fee: 0, freeThreshold: null, codAvailable: true, etaDays: null }] })]);
  await db.query("insert into products(slug,name,price,stock,published) values ('p','P',100,10,true)");
});
afterAll(() => db.close());

describe("email consent", () => {
  it("requires the explicit consent box and a valid email", async () => {
    await expect(subscribe(db, "a@example.com", "footer", false)).rejects.toBeInstanceOf(MarketingError);
    await expect(subscribe(db, "not-an-email", "footer", true)).rejects.toBeInstanceOf(MarketingError);
    expect((await db.query("select 1 from marketing_consent")).length).toBe(0);
  });

  it("records consent once per email, lists only active subscribers, and honours unsubscribe", async () => {
    await subscribe(db, "Buyer@Example.com", "footer", true);
    await subscribe(db, "buyer@example.com", "footer", true); // duplicate is harmless
    expect((await db.query("select 1 from marketing_consent")).length).toBe(1);
    const [s] = await activeSubscribers(db);
    expect(s.email).toBe("buyer@example.com");
    expect(await unsubscribe(db, "not-a-token")).toBe(false);
    expect(await unsubscribe(db, s.unsubscribeToken)).toBe(true);
    expect(await activeSubscribers(db)).toHaveLength(0);
    await subscribe(db, "buyer@example.com", "footer", true); // may re-subscribe with fresh consent
    expect(await activeSubscribers(db)).toHaveLength(1);
  });

  it("placing an order does NOT subscribe the customer", async () => {
    const pid = (await db.query<{ id: string }>("select id from products"))[0].id;
    await createOrder(db, { customerName: "Order Person", phone: "0300 1234567", email: "order.person@example.com", city: "Kamoki", address: "House 1, Street 2", paymentMethod: "cod", idempotencyKey: "retention-key-1-xxxxxxxxx", items: [{ productId: pid, quantity: 1 }] });
    expect((await activeSubscribers(db)).map((x) => x.email)).not.toContain("order.person@example.com");
  });

  it("neutralises spreadsheet formulas in CSV exports", () => {
    expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe("\"'=HYPERLINK(\"\"http://evil\"\")\"");
    expect(csvCell("normal@example.com")).toBe("\"normal@example.com\"");
  });
});

describe("funnel events", () => {
  it("stores only a name and a path, ignores unknown names, and strips query strings", async () => {
    await db.query("delete from analytics_events");
    await recordEvent(db, "product_view", "/product/p?utm=secret&email=a@b.co");
    await recordEvent(db, "evil" as never, "/x");
    const rows = await db.query<Record<string, unknown>>("select name, path, session_id from analytics_events");
    expect(rows).toEqual([{ name: "product_view", path: "/product/p", session_id: null }]);
  });

  it("an order is counted as order_placed only by the server flow, once per order", async () => {
    // order_placed is inserted by createOrder; verified here via the funnel counter
    const before = (await db.query<{ n: number }>("select count(*)::int as n from analytics_events where name = 'order_placed'"))[0].n;
    const pid = (await db.query<{ id: string }>("select id from products"))[0].id;
    const input = { customerName: "Funnel Person", phone: "0300 1234567", city: "Kamoki", address: "House 1, Street 2", paymentMethod: "cod", idempotencyKey: "retention-key-2-xxxxxxxxx", items: [{ productId: pid, quantity: 1 }] };
    await createOrder(db, input);
    await createOrder(db, input); // idempotent retry must not double count
    expect((await db.query<{ n: number }>("select count(*)::int as n from analytics_events where name = 'order_placed'"))[0].n).toBe(before + 1);
  });
});
