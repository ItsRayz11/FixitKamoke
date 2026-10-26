import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/lib/db";
import { migrate } from "@/lib/db/migrate";
import { createOrder, CheckoutError, hashToken } from "@/lib/orders/create-order";
import { gatewayStatuses, getPaymentOptions } from "@/lib/payments";
import { buildJazzcashForm, jazzcashConfig, jazzcashHash, readJazzcashResult } from "@/lib/payments/jazzcash";
import { createSafepayCheckout, readSafepayEvent, safepayConfig, verifySafepaySignature } from "@/lib/payments/safepay";
import { createAttempt, newReference, orderForPayment, settlePayment, PaymentStartError } from "@/lib/payments/settle";
import { expireUnpaidOnlineOrders } from "@/lib/payments/expire";
import { submitTransferReference, PaymentProofError } from "@/lib/orders/payment-proof";

let db: Db;
let pid: string;
let n = 0;
const ENV = { JAZZCASH_MERCHANT_ID: "MC1234", JAZZCASH_PASSWORD: "pw", JAZZCASH_INTEGRITY_SALT: "salt-123", SAFEPAY_API_KEY: "sec_pub", SAFEPAY_SECRET_KEY: "sk", SAFEPAY_WEBHOOK_SECRET: "whsec" } as unknown as NodeJS.ProcessEnv;
const jc = jazzcashConfig(ENV)!;
const sp = safepayConfig(ENV)!;

const place = (method: "cod" | "bank_transfer" | "online", provider?: "jazzcash" | "safepay", city = "Kamoki", opts: { staff?: boolean } = {}) =>
  createOrder(db, { customerName: "Pay Person", phone: "0300 1234567", city, address: "House 1, Street 2", paymentMethod: method, paymentProvider: provider, idempotencyKey: `online-key-${++n}-xxxxxxxxxxxxxxxx`, items: [{ productId: pid, quantity: 1 }] }, opts);
const setGateways = (v: object) => db.query("insert into store_settings(key,value) values ('gateways',$1) on conflict (key) do update set value = excluded.value", [JSON.stringify(v)]);

async function onlineOrder(provider: "jazzcash" | "safepay") {
  // Gateways are read from the process environment inside createOrder, so give it the test credentials for the duration.
  const keep = { ...process.env };
  Object.assign(process.env, ENV);
  try {
    await setGateways({ [provider]: { mode: "testing" } });
    const o = await place("online", provider, "Kamoki", { staff: true });
    const ord = (await orderForPayment(db, o.orderNumber, hashToken(o.trackingToken!)))!;
    return { o, ord, attempt: await createAttempt(db, ord) };
  } finally {
    for (const k of Object.keys(ENV)) if (keep[k] === undefined) delete process.env[k as string];
  }
}

beforeAll(async () => {
  db = await createPgliteDb();
  await migrate(db);
  await db.query("insert into store_settings(key,value) values ('shipping',$1)", [JSON.stringify({ version: "t", unlistedCity: "manual_confirmation", zones: [{ id: "l", label: "L", cities: ["Kamoki"], fee: 100, freeThreshold: null, codAvailable: true, etaDays: null }] })]);
  pid = (await db.query<{ id: string }>("insert into products(slug,name,price,stock,published) values ('p','P',900,500,true) returning id"))[0].id;
});
afterAll(() => db.close());

describe("JazzCash signing (published method)", () => {
  it("hashes the sorted non-empty pp_ fields with the salt as prefix and key, and matches an independent computation", () => {
    const fields = { pp_Amount: "100000", pp_Language: "EN", pp_MerchantID: "M", pp_SubMerchantID: "", ppmpf_1: "", pp_Version: "1.1", other: "ignored" };
    const expected = crypto.createHmac("sha256", "S").update("S&100000&EN&M&1.1").digest("hex");
    expect(jazzcashHash(fields, "S")).toBe(expected);
  });
  it("builds a signed form with the amount in paisa, Pakistan time, and a hash that verifies", () => {
    const f = buildJazzcashForm(jc, { reference: "T20261025120000AB12", amountPkr: 1000, orderNumber: "FX-ABC123", returnUrl: "https://shop.pk/api/pay/jazzcash/return", now: new Date("2026-10-25T07:00:00Z") });
    expect(f.action).toBe("https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/");
    expect(f.fields.pp_Amount).toBe("100000");
    expect(f.fields.pp_TxnDateTime).toBe("20261025120000"); // 07:00 UTC is 12:00 in Pakistan
    expect(f.fields.pp_TxnExpiryDateTime).toBe("20261025130000");
    expect(f.fields.pp_BillReference).toBe("FXABC123");
    expect(f.fields.pp_SecureHash).toBe(jazzcashHash(f.fields, "salt-123"));
  });
  it("accepts only a correctly signed result and reads it, and refuses tampering of any field", () => {
    const base: Record<string, string> = { pp_TxnRefNo: "TREF0001", pp_Amount: "100000", pp_ResponseCode: "000", pp_ResponseMessage: "Thank you", pp_RetreivalReferenceNo: "R99" };
    const signed = { ...base, pp_SecureHash: jazzcashHash(base, "salt-123").toUpperCase() }; // upper case is accepted too
    expect(readJazzcashResult(jc, signed)).toMatchObject({ verified: true, reference: "TREF0001", amountPkr: 1000, paid: true, providerRef: "R99" });
    expect(readJazzcashResult(jc, { ...signed, pp_Amount: "100" })).toMatchObject({ verified: false });
    expect(readJazzcashResult(jc, { ...signed, pp_ResponseCode: "124" })).toMatchObject({ verified: false });
    expect(readJazzcashResult(jc, { ...base })).toMatchObject({ verified: false });
    const bad = { ...base, pp_ResponseCode: "157" };
    expect(readJazzcashResult(jc, { ...bad, pp_SecureHash: jazzcashHash(bad, "salt-123") })).toMatchObject({ verified: true, paid: false, code: "157" });
    expect(readJazzcashResult(jc, { ...base, pp_SecureHash: jazzcashHash(base, "another-salt") })).toMatchObject({ verified: false });
  });
});

describe("Safepay (signed webhook)", () => {
  it("verifies the HMAC-SHA512 of the exact raw body, and nothing else", () => {
    const raw = JSON.stringify({ type: "payment.succeeded", data: { tracker: "track_abc12345", amount: 1000 } });
    const sig = crypto.createHmac("sha512", "whsec").update(raw).digest("hex");
    expect(verifySafepaySignature(raw, sig, "whsec")).toBe(true);
    expect(verifySafepaySignature(raw, sig.toUpperCase(), "whsec")).toBe(true);
    expect(verifySafepaySignature(raw + " ", sig, "whsec")).toBe(false); // a changed byte
    expect(verifySafepaySignature(raw, sig, "other-secret")).toBe(false);
    expect(verifySafepaySignature(raw, null, "whsec")).toBe(false);
    expect(verifySafepaySignature(raw, "abc", "whsec")).toBe(false);
  });
  it("reads success, failure, and unrelated events without depending on one field layout", () => {
    expect(readSafepayEvent({ type: "payment.succeeded", data: { notification: { tracker: "track_abc12345", amount: 1000 } } })).toMatchObject({ state: "paid", amounts: [1000] });
    expect(readSafepayEvent({ event: "payment.failed", data: { token: "t" } }).state).toBe("failed");
    expect(readSafepayEvent({ type: "refund.created" }).state).toBe("other");
    expect(readSafepayEvent({ type: "payment.succeeded", data: { tracker: "track_abc12345" } }).strings).toContain("track_abc12345");
  });
  it("starts a payment: posts the key and amount, returns the hosted address, and reports a refusal clearly", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const ok = (async (url: string, init: RequestInit) => { seen = { url, init }; return new Response(JSON.stringify({ data: { token: "track_zzz999" } }), { status: 200 }); }) as unknown as typeof fetch;
    const r = await createSafepayCheckout(sp, { reference: "TREF1", amountPkr: 1000, successUrl: "https://shop.pk/pay/result?ref=TREF1", cancelUrl: "https://shop.pk/pay/result?ref=TREF1" }, ok);
    expect(r.tracker).toBe("track_zzz999");
    expect(r.url).toContain("beacon=track_zzz999");
    expect(r.url).toContain("order_id=TREF1");
    expect(seen!.url).toBe("https://sandbox.api.getsafepay.com/order/v1/init");
    expect(JSON.parse(String(seen!.init.body))).toMatchObject({ client: "sec_pub", amount: 1000, currency: "PKR", environment: "sandbox" });
    const no = (async () => new Response("no", { status: 401 })) as unknown as typeof fetch;
    await expect(createSafepayCheckout(sp, { reference: "T", amountPkr: 1, successUrl: "https://a", cancelUrl: "https://a" }, no)).rejects.toThrow(/refused/);
    const odd = (async () => new Response(JSON.stringify({ data: {} }), { status: 200 })) as unknown as typeof fetch;
    await expect(createSafepayCheckout(sp, { reference: "T", amountPkr: 1, successUrl: "https://a", cancelUrl: "https://a" }, odd)).rejects.toThrow(/tracker/);
  });
});

describe("who may see and use an online gateway", () => {
  it("nobody while it is off, staff only while testing, customers only when live after a verified payment", async () => {
    const keep = { ...process.env }; Object.assign(process.env, ENV);
    try {
      await setGateways({ jazzcash: { mode: "off" } });
      expect((await getPaymentOptions(db, { staff: true })).online).toEqual([]);
      await setGateways({ jazzcash: { mode: "testing" } });
      expect((await getPaymentOptions(db, { staff: false })).online).toEqual([]);
      expect((await getPaymentOptions(db, { staff: true })).online).toEqual(["jazzcash"]);
      await setGateways({ jazzcash: { mode: "live" } });
      expect((await getPaymentOptions(db, { staff: false })).online).toEqual([]); // live but never verified: still hidden
      await db.query("insert into payment_events(provider, verified, outcome) values ('jazzcash', true, 'paid')");
      expect((await getPaymentOptions(db, { staff: false })).online).toEqual(["jazzcash"]);
      expect((await gatewayStatuses(db, ENV)).find((g) => g.id === "jazzcash")?.stage).toBe("live");
      await db.query("delete from payment_events");
    } finally { for (const k of Object.keys(ENV)) if (keep[k] === undefined) delete process.env[k as string]; }
  });
  it("a forged order for a gateway that is not available is refused and takes no stock", async () => {
    await setGateways({});
    const before = (await db.query<{ stock: number }>("select stock from products where id=$1", [pid]))[0].stock;
    await expect(place("online", "jazzcash")).rejects.toMatchObject({ code: "payment_unavailable" });
    await expect(place("online")).rejects.toBeInstanceOf(CheckoutError);
    expect((await db.query<{ stock: number }>("select stock from products where id=$1", [pid]))[0].stock).toBe(before);
  });
  it("online payment needs a confirmed delivery fee", async () => {
    const keep = { ...process.env }; Object.assign(process.env, ENV);
    try {
      await setGateways({ jazzcash: { mode: "testing" } });
      await expect(place("online", "jazzcash", "Faraway City", { staff: true })).rejects.toMatchObject({ code: "payment_unavailable" });
    } finally { for (const k of Object.keys(ENV)) if (keep[k] === undefined) delete process.env[k as string]; }
  });
});

describe("settling a payment", () => {
  it("creates a pending online order with the right amount and a short unique reference", async () => {
    const { o, attempt } = await onlineOrder("jazzcash");
    const row = (await db.query<{ payment_method: string; payment_provider: string; payment_status: string; total: number }>("select payment_method, payment_provider, payment_status, total from orders where order_number=$1", [o.orderNumber]))[0];
    expect(row).toMatchObject({ payment_method: "online", payment_provider: "jazzcash", payment_status: "pending", total: 1000 });
    expect(attempt.amount).toBe(1000);
    expect(attempt.reference).toMatch(/^T\d{14}[0-9A-F]{4}$/);
    expect(attempt.reference.length).toBeLessThanOrEqual(20);
    expect(newReference()).not.toBe(newReference());
  });

  it("marks the order paid only for the right reference and the exact amount, and only once", async () => {
    const { o, attempt } = await onlineOrder("jazzcash");
    // wrong amount, unknown reference, and a failed result change nothing
    expect((await settlePayment(db, { provider: "jazzcash", identifiers: [attempt.reference], amountPkr: 999, requireAmount: true, paid: true, providerRef: "R1" })).outcome).toBe("amount_mismatch");
    expect((await settlePayment(db, { provider: "jazzcash", identifiers: [attempt.reference], amountPkr: null, requireAmount: true, paid: true, providerRef: "R1" })).outcome).toBe("amount_mismatch");
    expect((await settlePayment(db, { provider: "jazzcash", identifiers: ["TNOTOURS"], amountPkr: 1000, requireAmount: true, paid: true, providerRef: "R1" })).outcome).toBe("unknown_reference");
    expect((await settlePayment(db, { provider: "safepay", identifiers: [attempt.reference], amountPkr: 1000, requireAmount: true, paid: true, providerRef: "R1" })).outcome).toBe("unknown_reference"); // right reference, wrong gateway
    const q = () => db.query<{ payment_status: string; payment_reference: string | null }>("select payment_status, payment_reference from orders where order_number=$1", [o.orderNumber]);
    expect((await q())[0].payment_status).toBe("pending");

    const ok = await settlePayment(db, { provider: "jazzcash", identifiers: [attempt.reference], amountPkr: 1000, requireAmount: true, paid: true, providerRef: "R77" });
    expect(ok).toMatchObject({ outcome: "paid", orderNumber: o.orderNumber });
    expect((await q())[0]).toEqual({ payment_status: "paid", payment_reference: "R77" });
    // a repeat is harmless, and a later "failed" can never undo a payment
    expect((await settlePayment(db, { provider: "jazzcash", identifiers: [attempt.reference], amountPkr: 1000, requireAmount: true, paid: true, providerRef: "R77" })).outcome).toBe("already_paid");
    expect((await settlePayment(db, { provider: "jazzcash", identifiers: [attempt.reference], amountPkr: 1000, requireAmount: true, paid: false, providerRef: null })).outcome).toBe("already_paid");
    expect((await q())[0].payment_status).toBe("paid");
    expect((await db.query("select 1 from audit_events where action = 'payment_received' and actor = 'gateway:jazzcash'")).length).toBe(1);
    // the log records what happened, and a verified paid event now exists for this gateway
    expect((await db.query<{ outcome: string }>("select outcome from payment_events where provider = 'jazzcash' and verified order by received_at")).map((r) => r.outcome)).toContain("paid");
  });

  it("a failed payment lets the customer try again, and a later success still counts", async () => {
    const { o, ord, attempt } = await onlineOrder("jazzcash");
    expect((await settlePayment(db, { provider: "jazzcash", identifiers: [attempt.reference], amountPkr: 1000, requireAmount: true, paid: false, providerRef: null })).outcome).toBe("failed");
    expect((await db.query<{ payment_status: string }>("select payment_status from orders where order_number=$1", [o.orderNumber]))[0].payment_status).toBe("failed");
    const retry = await createAttempt(db, { ...ord, paymentStatus: "failed" });
    expect(retry.reference).not.toBe(attempt.reference);
    expect((await db.query<{ payment_status: string }>("select payment_status from orders where order_number=$1", [o.orderNumber]))[0].payment_status).toBe("pending");
    expect((await settlePayment(db, { provider: "jazzcash", identifiers: [retry.reference], amountPkr: 1000, requireAmount: true, paid: true, providerRef: "R2" })).outcome).toBe("paid");
  });

  it("matches a Safepay notification by the tracker it issued, not by one field name", async () => {
    const { o, attempt } = await onlineOrder("safepay");
    await db.query("update payment_attempts set provider_ref = 'track_live0001' where id = $1", [attempt.id]);
    const ev = readSafepayEvent({ type: "payment.succeeded", data: { notification: { tracker: "track_live0001", amount: 1000 }, noise: "hello world" } });
    const r = await settlePayment(db, { provider: "safepay", identifiers: ev.strings, amountPkr: ev.amounts[0], requireAmount: true, paid: ev.state === "paid", providerRef: null });
    expect(r.outcome).toBe("paid");
    expect((await db.query<{ payment_status: string }>("select payment_status from orders where order_number=$1", [o.orderNumber]))[0].payment_status).toBe("paid");
  });

  it("cannot be started for a paid, cancelled, or unconfirmed-delivery order", async () => {
    const { ord } = await onlineOrder("jazzcash");
    await expect(createAttempt(db, { ...ord, paymentStatus: "paid" })).rejects.toBeInstanceOf(PaymentStartError);
    await expect(createAttempt(db, { ...ord, status: "cancelled" })).rejects.toBeInstanceOf(PaymentStartError);
    await expect(createAttempt(db, { ...ord, shippingStatus: "needs_confirmation" })).rejects.toBeInstanceOf(PaymentStartError);
    await expect(createAttempt(db, { ...ord, paymentMethod: "cod" })).rejects.toBeInstanceOf(PaymentStartError);
  });

  it("does not let someone with a wrong token start or see a payment", async () => {
    const { o } = await onlineOrder("jazzcash");
    expect(await orderForPayment(db, o.orderNumber, hashToken("wrong-token"))).toBeNull();
  });
});

describe("transfer references (manual payments)", () => {
  it("saves the customer's transaction ID for staff, never marks the order paid, and only for transfers", async () => {
    const o = await place("bank_transfer");
    await submitTransferReference(db, o.orderNumber, o.trackingToken!, "  TID 998877  ");
    const row = (await db.query<{ payment_status: string; payment_reference: string }>("select payment_status, payment_reference from orders where order_number=$1", [o.orderNumber]))[0];
    expect(row).toEqual({ payment_status: "pending", payment_reference: "TID 998877" });
    await expect(submitTransferReference(db, o.orderNumber, "wrong-token-value", "TID 111111")).rejects.toBeInstanceOf(PaymentProofError);
    await expect(submitTransferReference(db, o.orderNumber, o.trackingToken!, "ab")).rejects.toBeInstanceOf(PaymentProofError);
    const cod = await place("cod");
    await expect(submitTransferReference(db, cod.orderNumber, cod.trackingToken!, "TID 123456")).rejects.toThrow(/not paid by transfer/);
    await db.query("update orders set payment_status = 'paid' where order_number = $1", [o.orderNumber]);
    await expect(submitTransferReference(db, o.orderNumber, o.trackingToken!, "TID 222222")).rejects.toThrow(/already marked as paid/);
  });
});

describe("abandoned online orders", () => {
  it("are cancelled after a day and their stock returns, but paid, recent and other orders are left alone", async () => {
    const stock = async () => (await db.query<{ stock: number }>("select stock from products where id=$1", [pid]))[0].stock;
    const status = async (num: string) => (await db.query<{ status: string }>("select status from orders where order_number=$1", [num]))[0].status;
    const old = await onlineOrder("jazzcash");
    const recent = await onlineOrder("jazzcash");
    const paid = await onlineOrder("jazzcash");
    const transfer = await place("bank_transfer");
    await settlePayment(db, { provider: "jazzcash", identifiers: [paid.attempt.reference], amountPkr: 1000, requireAmount: true, paid: true, providerRef: "RP" });
    for (const n of [old.o.orderNumber, paid.o.orderNumber, transfer.orderNumber]) await db.query("update orders set created_at = now() - interval '30 hours' where order_number = $1", [n]);

    const before = await stock();
    expect(await expireUnpaidOnlineOrders(db, 24)).toBe(1);
    expect(await status(old.o.orderNumber)).toBe("cancelled");
    expect(await stock()).toBe(before + 1);
    expect(await status(recent.o.orderNumber)).toBe("pending_confirmation");
    expect(await status(paid.o.orderNumber)).toBe("pending_confirmation"); // paid: never auto-cancelled
    expect(await status(transfer.orderNumber)).toBe("pending_confirmation"); // only online orders expire
    expect(await expireUnpaidOnlineOrders(db, 24)).toBe(0); // nothing more to do, and no double restock
    expect(await stock()).toBe(before + 1);
    // if the money turns up late anyway, it is recorded and flagged for a refund rather than lost
    const late = await settlePayment(db, { provider: "jazzcash", identifiers: [old.attempt.reference], amountPkr: 1000, requireAmount: true, paid: true, providerRef: "RLATE" });
    expect(late.outcome).toBe("paid");
    expect((await db.query("select 1 from audit_events where action = 'payment_received_after_cancel'")).length).toBe(1);
  });
});
