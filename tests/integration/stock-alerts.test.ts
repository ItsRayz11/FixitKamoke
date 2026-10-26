import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/lib/db";
import { migrate } from "@/lib/db/migrate";
import { releaseRestockedAlerts, requestStockAlert, StockAlertError, waitingCounts } from "@/lib/stock-alerts";
import { processOutbox, type SendFn } from "@/lib/email/outbox";
import { renderBackInStock } from "@/lib/email/templates";

let db: Db;
let sold: string;
let avail: string;
let draft: string;
const ctx = { baseUrl: "https://shop.example", whatsappNumber: null, contactEmail: "help@shop.example" };

beforeAll(async () => {
  db = await createPgliteDb();
  await migrate(db);
  const ins = async (slug: string, stock: number, published: boolean, label: string | null) =>
    (await db.query<{ id: string }>(
      "insert into products(slug,name,price,stock,published,variant_group,variant_label) values ($1,'Case',900,$2,$3,$4,$5) returning id",
      [slug, stock, published, label ? "case" : null, label]))[0].id;
  sold = await ins("case-red", 0, true, "Red");
  avail = await ins("case-green", 5, true, "Green");
  draft = await ins("case-draft", 0, false, null);
});
afterAll(() => db.close());

const sentTo = async (rows = 20) => {
  const sent: { to: string; subject: string; text: string }[] = [];
  const send: SendFn = async (m) => { sent.push({ to: m.to, subject: m.subject, text: m.text }); };
  await processOutbox(db, ctx, send, rows);
  return sent;
};

describe("requesting an alert", () => {
  it("rejects a bad email, an item that is in stock, and an unpublished item", async () => {
    await expect(requestStockAlert(db, sold, "not-an-email")).rejects.toBeInstanceOf(StockAlertError);
    await expect(requestStockAlert(db, avail, "a@example.com")).rejects.toThrow(/in stock now/);
    await expect(requestStockAlert(db, draft, "a@example.com")).rejects.toThrow(/could not find/);
    await expect(requestStockAlert(db, "00000000-0000-0000-0000-000000000000", "a@example.com")).rejects.toThrow(/could not find/);
  });

  it("stores one request per person and item, lower-cased", async () => {
    await requestStockAlert(db, sold, "Buyer@Example.com");
    await requestStockAlert(db, sold, "buyer@example.com"); // same person asking again
    await requestStockAlert(db, sold, "other@example.com");
    expect(await waitingCounts(db)).toEqual({ [sold]: 2 });
    const rows = await db.query<{ email: string }>("select email from stock_alerts order by email");
    expect(rows.map((r) => r.email)).toEqual(["buyer@example.com", "other@example.com"]);
  });
});

describe("releasing alerts", () => {
  it("sends nothing while the item is still sold out", async () => {
    expect(await releaseRestockedAlerts(db)).toBe(0);
    expect((await db.query("select 1 from notification_outbox where kind = 'back_in_stock'")).length).toBe(0);
  });

  it("queues exactly one email per waiting person once stock returns, then never again", async () => {
    await db.query("update products set stock = 3 where id = $1", [sold]);
    expect(await releaseRestockedAlerts(db)).toBe(2);
    expect(await releaseRestockedAlerts(db)).toBe(0); // running the sweep again does not re-send
    const sent = await sentTo();
    const mine = sent.filter((m) => /back in stock/.test(m.subject));
    expect(mine.map((m) => m.to).sort()).toEqual(["buyer@example.com", "other@example.com"]);
    expect(mine[0].subject).toBe("Case — Red is back in stock");
    expect(mine[0].text).toContain("https://shop.example/product/case-red");
    expect(await waitingCounts(db)).toEqual({}); // nobody is waiting any more
    expect((await sentTo()).length).toBe(0); // a second outbox run sends nothing new
  });

  it("lets someone ask again later and be told again", async () => {
    await db.query("update products set stock = 0 where id = $1", [sold]);
    await requestStockAlert(db, sold, "buyer@example.com");
    await db.query("update products set stock = 1 where id = $1", [sold]);
    expect(await releaseRestockedAlerts(db)).toBe(1);
    expect((await sentTo()).filter((m) => m.to === "buyer@example.com").length).toBe(1);
  });

  it("does not release for an unpublished product even if stock exists", async () => {
    await db.query("update products set published = true where id = $1", [draft]); // must be published to request
    await requestStockAlert(db, draft, "late@example.com");
    await db.query("update products set published = false, stock = 9 where id = $1", [draft]);
    expect(await releaseRestockedAlerts(db)).toBe(0);
  });

  it("deletes finished requests and their queued email address after 30 days", async () => {
    await db.query("update stock_alerts set notified_at = now() - interval '31 days' where notified_at is not null");
    await db.query("update notification_outbox set created_at = now() - interval '31 days' where kind = 'back_in_stock'");
    await releaseRestockedAlerts(db);
    expect((await db.query("select 1 from stock_alerts where notified_at is not null")).length).toBe(0);
    expect((await db.query("select 1 from notification_outbox where kind = 'back_in_stock'")).length).toBe(0);
  });
});

describe("the email", () => {
  it("is honest that stock can run out again and carries no marketing", () => {
    const r = renderBackInStock({ name: "Case — Red", slug: "case-red", stock: 3 }, ctx);
    expect(r.html).toContain("sell out again");
    expect(r.text).toContain("will not send another");
    expect(r.html).not.toMatch(/unsubscribe|% off|sale/i);
  });
  it("escapes the product name", () => {
    expect(renderBackInStock({ name: "<script>x</script>", slug: "s", stock: 1 }, ctx).html).not.toContain("<script>x");
  });
});
