import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/lib/db";
import { migrate } from "@/lib/db/migrate";
import { createOrder } from "@/lib/orders/create-order";
import { createRepairInquiry } from "@/lib/repairs/repairs";
import { transitionOrder } from "@/lib/orders/admin";
import { emailConfig, processOutbox, resendSender, type SendFn } from "@/lib/email/outbox";
import { escapeHtml, renderOrderEmail } from "@/lib/email/templates";

let db: Db;
let n = 0;
const ctx = { baseUrl: "https://shop.example", whatsappNumber: "923001234567", contactEmail: null };

beforeAll(async () => {
  db = await createPgliteDb();
  await migrate(db);
  await db.query("insert into store_settings(key,value) values ('shipping',$1)", [JSON.stringify({ version: "t", unlistedCity: "manual_confirmation", zones: [{ id: "l", label: "L", cities: ["Kamoki"], fee: 0, freeThreshold: null, codAvailable: true, etaDays: null }] })]);
  await db.query("insert into products(slug,name,price,stock,published) values ('x','Cable <b>1m</b>',500,100,true)");
});
afterAll(() => db.close());

const placeOrder = async (email: string | null = "buyer@example.com") => {
  const pid = (await db.query<{ id: string }>("select id from products limit 1"))[0].id;
  return createOrder(db, { customerName: "Ayesha Khan", phone: "0300 1234567", email: email ?? undefined, city: "Kamoki", address: "House 1, Street 2", paymentMethod: "cod", idempotencyKey: `email-test-key-${++n}-zzzzzzzz`, items: [{ productId: pid, quantity: 2 }] });
};

describe("email outbox", () => {
  it("does nothing and sends nothing when email is not configured", async () => {
    await placeOrder();
    expect(emailConfig({} as NodeJS.ProcessEnv)).toBeNull();
    const r = await processOutbox(db, ctx, null);
    expect(r).toMatchObject({ configured: false, sent: 0 });
    expect((await db.query("select 1 from notification_outbox where status = 'pending'")).length).toBeGreaterThan(0);
  });

  it("sends each queued email exactly once with a stable idempotency key, rendering real order data", async () => {
    await db.query("delete from notification_outbox");
    const o = await placeOrder();
    const sent: Parameters<SendFn>[0][] = [];
    const send: SendFn = async (m) => { sent.push(m); };
    const r1 = await processOutbox(db, ctx, send);
    const r2 = await processOutbox(db, ctx, send);
    expect(r1.sent).toBe(1);
    expect(r2.sent).toBe(0);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("buyer@example.com");
    expect(sent[0].idempotencyKey).toBe(`order_received:${o.orderNumber}`);
    expect(sent[0].subject).toContain(o.orderNumber);
    expect(sent[0].text).toContain("Rs. 1,000");
    expect(sent[0].html).toContain("Cable &lt;b&gt;1m&lt;/b&gt;"); // product names are escaped
    expect(sent[0].html).not.toContain("<b>1m</b>");
  });

  it("retries failures, gives up after 5 attempts, and never touches the order", async () => {
    await db.query("delete from notification_outbox");
    const o = await placeOrder();
    const failing: SendFn = async () => { throw new Error("provider down"); };
    for (let i = 0; i < 5; i++) await processOutbox(db, ctx, failing);
    const row = (await db.query<{ status: string; attempts: number; last_error: string }>("select status, attempts, last_error from notification_outbox"))[0];
    expect(row).toMatchObject({ status: "failed", attempts: 5 });
    expect(row.last_error).toContain("provider down");
    expect((await db.query<{ status: string }>("select status from orders where order_number = $1", [o.orderNumber]))[0].status).toBe("pending_confirmation");
  });

  it("queues a notification at each order milestone and a repair update, once each", async () => {
    await db.query("delete from notification_outbox");
    const o = await placeOrder();
    const id = (await db.query<{ id: string }>("select id from orders where order_number=$1", [o.orderNumber]))[0].id;
    await transitionOrder(db, id, "confirmed", "staff");
    await transitionOrder(db, id, "cancelled", "staff");
    await createRepairInquiry(db, { customerName: "Rita", phone: "0300 1234567", email: "r@example.com", deviceBrand: "Samsung", deviceModel: "A1", issue: "Broken screen here", preferredContact: "call" });
    const kinds = (await db.query<{ kind: string }>("select kind from notification_outbox order by kind")).map((r) => r.kind);
    expect(kinds).toEqual(["order_cancelled", "order_confirmed", "order_received", "repair_received"]);
    const sent: string[] = [];
    await processOutbox(db, ctx, async (m) => { sent.push(m.subject); });
    expect(sent).toHaveLength(4);
    expect(sent.some((s) => s.startsWith("We received your repair request RP-"))).toBe(true);
  });

  it("does not queue email when the customer gave none", async () => {
    await db.query("delete from notification_outbox");
    await placeOrder(null);
    expect((await db.query("select 1 from notification_outbox")).length).toBe(0);
  });

  it("expires notifications that sat unsent for over a week", async () => {
    await db.query("delete from notification_outbox");
    await placeOrder();
    await db.query("update notification_outbox set created_at = now() - interval '8 days'");
    const sent: string[] = [];
    const r = await processOutbox(db, ctx, async (m) => { sent.push(m.subject); });
    expect(r.expired).toBe(1);
    expect(sent).toHaveLength(0);
  });
});

describe("resend adapter and templates", () => {
  it("posts to the Resend API with auth and idempotency headers, and hides the key in errors", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const ok = (async (url: string, init: RequestInit) => { seen = { url, init }; return new Response("{}", { status: 200 }); }) as unknown as typeof fetch;
    await resendSender({ apiKey: "re_secret", from: "Fixit <orders@example.com>" }, ok)({ to: "a@b.co", subject: "S", html: "<p>h</p>", text: "t", idempotencyKey: "k1" });
    const s = seen as unknown as { url: string; init: RequestInit };
    expect(s.url).toBe("https://api.resend.com/emails");
    expect((s.init.headers as Record<string, string>)["Idempotency-Key"]).toBe("k1");
    expect(JSON.parse(String(s.init.body)).to).toEqual(["a@b.co"]);
    const bad = (async () => new Response("invalid domain", { status: 403 })) as unknown as typeof fetch;
    const err = await resendSender({ apiKey: "re_secret", from: "x" }, bad)({ to: "a@b.co", subject: "S", html: "h", text: "t", idempotencyKey: "k" }).catch((e: Error) => e);
    expect((err as Error).message).toContain("403");
    expect((err as Error).message).not.toContain("re_secret");
  });

  it("escapes markup and refuses unknown kinds", () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
    expect(renderOrderEmail("nonsense", { orderNumber: "FX-1", customerName: "A", status: "x", paymentMethod: "cod", subtotal: 1, discount: 0, shippingFee: 0, shippingStatus: "quoted", total: 1, items: [] }, ctx)).toBeNull();
  });
});
