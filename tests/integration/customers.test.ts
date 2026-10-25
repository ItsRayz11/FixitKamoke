import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/lib/db";
import { migrate } from "@/lib/db/migrate";
import { createOrder } from "@/lib/orders/create-order";
import {
  authenticateCustomer, changePassword, createPasswordReset, CustomerError, deleteAddress, deleteCustomerAccount, listAddresses,
  registerCustomer, resetPassword, saveAddress, toggleWishlist,
} from "@/lib/customers/customers";

let db: Db;
const reg = (o: Record<string, unknown> = {}) => ({ name: "Sana Ali", email: "sana@example.com", phone: "0300 1112233", password: "Correct-horse-9", ...o });

beforeAll(async () => {
  db = await createPgliteDb();
  await migrate(db);
  await db.query("insert into store_settings(key,value) values ('shipping',$1)", [JSON.stringify({ version: "t", unlistedCity: "manual_confirmation", zones: [{ id: "l", label: "L", cities: ["Kamoki"], fee: 0, freeThreshold: null, codAvailable: true, etaDays: null }] })]);
  await db.query("insert into products(slug,name,price,stock,published) values ('p1','P1',100,10,true),('p2','Hidden',100,10,false)");
});
afterAll(() => db.close());

describe("accounts", () => {
  it("registers, hashes the password, and rejects duplicates, weak passwords and bad phones", async () => {
    const id = await registerCustomer(db, reg());
    const row = (await db.query<{ password_hash: string; email: string; phone: string }>("select password_hash, email, phone from customers where id=$1", [id]))[0];
    expect(row.password_hash.startsWith("scrypt$")).toBe(true);
    expect(row.password_hash).not.toContain("Correct-horse-9");
    expect(row.phone).toBe("+923001112233");
    await expect(registerCustomer(db, reg({ email: "SANA@example.com" }))).rejects.toMatchObject({ code: "exists" });
    await expect(registerCustomer(db, reg({ email: "b@example.com", password: "short1" }))).rejects.toMatchObject({ code: "weak_password" });
    await expect(registerCustomer(db, reg({ email: "c@example.com", password: "onlyletterslong" }))).rejects.toMatchObject({ code: "weak_password" });
    await expect(registerCustomer(db, reg({ email: "d@example.com", phone: "123" }))).rejects.toMatchObject({ code: "invalid" });
  });

  it("authenticates with the right password only, and treats unknown emails identically", async () => {
    expect(await authenticateCustomer(db, "Sana@Example.com", "Correct-horse-9")).toBeTruthy();
    await expect(authenticateCustomer(db, "sana@example.com", "wrong-password-1")).rejects.toMatchObject({ code: "bad_credentials", message: "Incorrect email or password." });
    await expect(authenticateCustomer(db, "nobody@example.com", "wrong-password-1")).rejects.toMatchObject({ code: "bad_credentials", message: "Incorrect email or password." });
  });

  it("password reset: single use, expires, signs out everywhere, only the newest link works", async () => {
    const id = await authenticateCustomer(db, "sana@example.com", "Correct-horse-9");
    await db.query("insert into customer_sessions(customer_id, token_hash, expires_at) values ($1,'h1', now() + interval '1 day')", [id]);
    expect(await createPasswordReset(db, "nobody@example.com")).toBeNull();
    const a = (await createPasswordReset(db, "sana@example.com"))!;
    const b = (await createPasswordReset(db, "sana@example.com"))!;
    await expect(resetPassword(db, a.token, "Another-pass-77")).rejects.toMatchObject({ code: "bad_token" }); // superseded
    await expect(resetPassword(db, b.token, "weak")).rejects.toMatchObject({ code: "weak_password" });
    await resetPassword(db, b.token, "Another-pass-77");
    await expect(resetPassword(db, b.token, "Third-pass-1234")).rejects.toMatchObject({ code: "bad_token" }); // single use
    expect((await db.query("select 1 from customer_sessions where customer_id=$1", [id])).length).toBe(0);
    await expect(authenticateCustomer(db, "sana@example.com", "Correct-horse-9")).rejects.toBeInstanceOf(CustomerError);
    expect(await authenticateCustomer(db, "sana@example.com", "Another-pass-77")).toBe(id);

    const c = (await createPasswordReset(db, "sana@example.com"))!;
    await db.query("update password_resets set expires_at = now() - interval '1 minute'");
    await expect(resetPassword(db, c.token, "Expired-pass-123")).rejects.toMatchObject({ code: "bad_token" });
  });

  it("stores only a hash of the reset token, and queues one reset email", async () => {
    const r = (await createPasswordReset(db, "sana@example.com"))!;
    expect((await db.query("select 1 from password_resets where token_hash = $1", [r.token])).length).toBe(0);
    expect((await db.query("select 1 from notification_outbox where kind = 'password_reset'")).length).toBeGreaterThan(0);
  });

  it("changing the password requires the current one", async () => {
    const id = await authenticateCustomer(db, "sana@example.com", "Another-pass-77");
    await expect(changePassword(db, id, "not-my-password1", "Brand-new-pass-5")).rejects.toMatchObject({ code: "bad_credentials" });
    await changePassword(db, id, "Another-pass-77", "Brand-new-pass-5");
    expect(await authenticateCustomer(db, "sana@example.com", "Brand-new-pass-5")).toBe(id);
  });

  it("addresses: scoped to the owner, one default, validated", async () => {
    const me = await authenticateCustomer(db, "sana@example.com", "Brand-new-pass-5");
    const other = await registerCustomer(db, reg({ email: "other@example.com", phone: "" }));
    const a = { label: "Home", recipientName: "Sana Ali", phone: "0300 1112233", city: "Kamoki", address: "House 4, Street 9", isDefault: true };
    await saveAddress(db, me, a);
    await saveAddress(db, me, { ...a, label: "Work", isDefault: true });
    const list = await listAddresses(db, me);
    expect(list.filter((x) => x.isDefault)).toHaveLength(1);
    expect(list[0].label).toBe("Work");
    await expect(saveAddress(db, me, { ...a, phone: "12" })).rejects.toThrow();
    await deleteAddress(db, other, list[0].id); // another customer cannot delete it
    expect(await listAddresses(db, me)).toHaveLength(2);
    await expect(saveAddress(db, other, a, list[0].id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("wishlist toggles and ignores unpublished products", async () => {
    const me = await authenticateCustomer(db, "sana@example.com", "Brand-new-pass-5");
    const [p1, p2] = (await db.query<{ id: string }>("select id from products order by slug")).map((r) => r.id);
    expect(await toggleWishlist(db, me, p1)).toBe(true);
    expect(await toggleWishlist(db, me, p1)).toBe(false);
    await toggleWishlist(db, me, p2);
    expect((await db.query("select 1 from wishlist_items where customer_id=$1", [me])).length).toBe(0);
  });

  it("deleting an account needs the password, removes personal data, but keeps order records", async () => {
    const id = await authenticateCustomer(db, "sana@example.com", "Brand-new-pass-5");
    const pid = (await db.query<{ id: string }>("select id from products where slug='p1'"))[0].id;
    await createOrder(db, { customerName: "Sana Ali", phone: "0300 1112233", city: "Kamoki", address: "House 4, Street 9", paymentMethod: "cod", idempotencyKey: "acct-order-key-1-xxxxxxxx", items: [{ productId: pid, quantity: 1 }] }, { customerId: id });
    await expect(deleteCustomerAccount(db, id, "wrong-password-1")).rejects.toMatchObject({ code: "bad_credentials" });
    await deleteCustomerAccount(db, id, "Brand-new-pass-5");
    expect((await db.query("select 1 from customers where id=$1", [id])).length).toBe(0);
    expect((await db.query("select 1 from customer_addresses where customer_id=$1", [id])).length).toBe(0);
    const order = (await db.query<{ customer_id: string | null; customer_name: string }>("select customer_id, customer_name from orders where idempotency_key='acct-order-key-1-xxxxxxxx'"))[0];
    expect(order.customer_id).toBeNull();
    expect(order.customer_name).toBe("Sana Ali");
  });
});

describe("password reset email", () => {
  it("is sent with the link, wipes the secret afterwards, and expires after an hour", async () => {
    const { processOutbox } = await import("@/lib/email/outbox");
    await db.query("delete from notification_outbox");
    await registerCustomer(db, reg({ email: "reset.me@example.com", phone: "" }));
    const r = (await createPasswordReset(db, "reset.me@example.com"))!;
    const sent: { text: string; to: string; subject: string }[] = [];
    await processOutbox(db, { baseUrl: "https://shop.example", whatsappNumber: null, contactEmail: null }, async (m) => { sent.push(m); });
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain(`https://shop.example/account/reset?token=${r.token}`);
    expect((await db.query<{ payload: object }>("select payload from notification_outbox"))[0].payload).toEqual({});

    const r2 = (await createPasswordReset(db, "reset.me@example.com"))!;
    await db.query("update notification_outbox set created_at = now() - interval '2 hours' where status = 'pending'");
    const out: string[] = [];
    const res = await processOutbox(db, { baseUrl: "https://shop.example", whatsappNumber: null, contactEmail: null }, async (m) => { out.push(m.text); });
    expect(res.expired).toBe(1);
    expect(out).toHaveLength(0);
    expect(JSON.stringify(await db.query("select payload from notification_outbox"))).not.toContain(r2.token);
  });
});
