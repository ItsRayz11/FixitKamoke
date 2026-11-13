import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/lib/db";
import { migrate } from "@/lib/db/migrate";
import { createOrder } from "@/lib/orders/create-order";
import { addOrderNote, setPaymentStatus, transitionOrder } from "@/lib/orders/admin";
import { orderEmailStale, processOutbox, type SendFn } from "@/lib/email/outbox";
import { connectionState, getLastTest, runEmailTest } from "@/lib/email/status";

let db: Db;
let item: string;
let n = 0;
const key = () => `email-test-key-${++n}-${"x".repeat(10)}`;
const ctx = { baseUrl: "https://fixit-kamoke.vercel.app", whatsappNumber: null, contactEmail: null };
const cfg = { apiKey: "re_test_secret_value", from: "Fixit <orders@example.test>" };

const sent: { to: string; subject: string; text: string }[] = [];
const okSend: SendFn = async (m) => { sent.push({ to: m.to, subject: m.subject, text: m.text }); };

async function place(method: "cod" | "bank_transfer" = "bank_transfer") {
  const o = await createOrder(db, { customerName: "Mail Person", phone: "0300 1234567", email: "mail@example.test", city: "Kamoki", address: "Test street 1, Test area", paymentMethod: method, idempotencyKey: key(), items: [{ productId: item, quantity: 1 }] });
  return (await db.query<{ id: string; order_number: string }>("select id, order_number from orders where order_number = $1", [o.orderNumber]))[0];
}

beforeAll(async () => {
  db = await createPgliteDb();
  await migrate(db);
  await db.query("insert into store_settings(key,value) values ('shipping',$1)", [JSON.stringify({ version: "t", unlistedCity: "manual_confirmation", zones: [{ id: "l", label: "L", cities: ["Kamoki"], fee: 0, freeThreshold: null, codAvailable: true, etaDays: [1, 1] }] })]);
  item = (await db.query<{ id: string }>("insert into products(slug,name,price,stock,published,sku) values ('m','M',1000,500,true,'M') returning id"))[0].id;
});
afterAll(() => db.close());

describe("email connection status is only ever what has been proven", () => {
  it("is 'setup required' without settings, and 'not tested' with settings but no test", async () => {
    expect(connectionState(null, null)).toBe("setup_required");
    expect(connectionState(cfg, null)).toBe("untested");
  });

  it("a failed test never says connected, and does not leak the API key", async () => {
    const bad: SendFn = async () => { throw new Error("Resend 403: domain not verified"); };
    const rec = await runEmailTest(db, cfg, bad, "owner@example.test");
    expect(rec.ok).toBe(false);
    expect(JSON.stringify(rec)).not.toContain(cfg.apiKey);
    expect(connectionState(cfg, await getLastTest(db))).toBe("error");
  });

  it("only a send the provider accepted makes it connected, and recipients are stored masked", async () => {
    const rec = await runEmailTest(db, cfg, okSend, "owner@example.test");
    expect(rec).toMatchObject({ ok: true, to: "o***@example.test" });
    expect(connectionState(cfg, await getLastTest(db))).toBe("connected");
  });

  it("refuses an invalid address and an unconfigured server without sending", async () => {
    const before = sent.length;
    expect((await runEmailTest(db, cfg, okSend, "not-an-email")).ok).toBe(false);
    expect((await runEmailTest(db, null, null, "a@b.test")).error).toMatch(/not set up/);
    expect(sent.length).toBe(before);
  });
});

describe("customer emails are only sent while they are still true", () => {
  it("classifies stale messages", () => {
    const o = (over: Partial<Parameters<typeof orderEmailStale>[1]>) => ({ status: "pending_confirmation", payment_status: "unpaid", advance_paid: 0, refunded_amount: 0, ...over });
    expect(orderEmailStale("order_confirmed", o({ status: "cancelled" }))).toBe(true);
    expect(orderEmailStale("order_confirmed", o({ status: "confirmed" }))).toBe(false);
    expect(orderEmailStale("order_payment_confirmed", o({ payment_status: "unpaid" }))).toBe(true);
    expect(orderEmailStale("order_payment_confirmed", o({ payment_status: "paid" }))).toBe(false);
    expect(orderEmailStale("order_shipped", o({ status: "confirmed" }))).toBe(true);
    expect(orderEmailStale("order_received", o({ status: "cancelled" }))).toBe(true);
    expect(orderEmailStale("order_refunded", o({ refunded_amount: 0 }))).toBe(true);
  });

  it("an order that was cancelled before its 'received' email went out sends nothing, and says why", async () => {
    const o = await place();
    await transitionOrder(db, o.id, "cancelled", "s");
    const before = sent.length;
    await processOutbox(db, ctx, okSend);
    expect(sent.filter((m) => m.subject.includes(o.order_number) && m.subject.includes("received")).length).toBe(0);
    expect(sent.length).toBe(before + sent.slice(before).length);
    const row = (await db.query<{ status: string; last_error: string }>("select status, last_error from notification_outbox where dedupe_key = $1", [`order_received:${o.order_number}`]))[0];
    expect(row.status).toBe("failed");
    expect(row.last_error).toMatch(/no longer accurate/);
  });

  it("an unpaid transfer order's first email says it is waiting for payment and not confirmed", async () => {
    const o = await place("bank_transfer");
    await processOutbox(db, ctx, okSend);
    const mail = sent.find((m) => m.subject.includes(o.order_number));
    expect(mail?.text).toContain("Waiting for your payment of Rs. 1,000");
    expect(mail?.text).toContain("It is not confirmed yet");
  });

  it("marking an order paid queues exactly one 'payment received' email, and it is sent once", async () => {
    const o = await place("bank_transfer");
    await setPaymentStatus(db, o.id, "paid", "staff@test");
    await setPaymentStatus(db, o.id, "paid", "staff@test"); // a repeat does not queue a second one
    expect((await db.query("select 1 from notification_outbox where dedupe_key = $1", [`order_payment_confirmed:${o.order_number}`])).length).toBe(1);
    await processOutbox(db, ctx, okSend);
    await processOutbox(db, ctx, okSend);
    expect(sent.filter((m) => m.subject === `We received your payment for order ${o.order_number}`).length).toBe(1);
  });

  it("nothing is sent, and nothing is marked sent, when email is not configured", async () => {
    const o = await place("cod");
    await db.query("update notification_outbox set status = 'pending' where dedupe_key = $1", [`order_received:${o.order_number}`]);
    const r = await processOutbox(db, ctx, null);
    expect(r).toMatchObject({ configured: false, sent: 0 });
    expect((await db.query<{ status: string }>("select status from notification_outbox where dedupe_key = $1", [`order_received:${o.order_number}`]))[0].status).toBe("pending");
  });
});

describe("other customer emails", () => {
  it("a contact acknowledgement says it is automatic and promises no answer time", async () => {
    await db.query("insert into notification_outbox(kind, recipient, payload, dedupe_key) values ('contact_received','c@example.test',$1,'contact_received:test-1')", [JSON.stringify({ name: "Chris Customer" })]);
    await processOutbox(db, ctx, okSend);
    const mail = sent.find((m) => m.to === "c@example.test");
    expect(mail?.subject).toBe("We received your message");
    expect(mail?.text).toContain("automatic acknowledgement");
  });

  it("order notes stay internal: they are never part of any customer email", async () => {
    const o = await place("cod");
    await addOrderNote(db, o.id, "SECRET-INTERNAL-NOTE", "staff@test");
    await processOutbox(db, ctx, okSend);
    expect(sent.some((m) => m.text.includes("SECRET-INTERNAL-NOTE"))).toBe(false);
  });
});
