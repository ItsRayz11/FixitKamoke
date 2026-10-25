import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/lib/db";
import { migrate } from "@/lib/db/migrate";
import { createOrder } from "@/lib/orders/create-order";
import { createRepairInquiry } from "@/lib/repairs/repairs";
import { processOutbox } from "@/lib/email/outbox";

let db: Db;
let pid: string;
let n = 0;
const ctx = { baseUrl: "https://shop.example", whatsappNumber: null, contactEmail: "owner@shop.example" };
const setStore = (v: object) => db.query("insert into store_settings(key,value) values ('store',$1) on conflict (key) do update set value = excluded.value", [JSON.stringify(v)]);
const order = () => createOrder(db, { customerName: "Alert Customer", phone: "0300 1234567", email: "buyer@example.com", city: "Kamoki", address: "House 1, Secret Street 22", paymentMethod: "cod", idempotencyKey: `alert-key-${++n}-xxxxxxxxxxxxxxxx`, items: [{ productId: pid, quantity: 2 }] });
const alerts = () => db.query<{ recipient: string; payload: Record<string, string> }>("select recipient, payload from notification_outbox where kind = 'staff_alert' order by created_at");

beforeAll(async () => {
  db = await createPgliteDb();
  await migrate(db);
  await db.query("insert into store_settings(key,value) values ('shipping',$1)", [JSON.stringify({ version: "t", unlistedCity: "manual_confirmation", zones: [{ id: "l", label: "L", cities: ["Kamoki"], fee: 0, freeThreshold: null, codAvailable: true, etaDays: null }] })]);
  pid = (await db.query<{ id: string }>("insert into products(slug,name,price,stock,published) values ('p','P',100,50,true) returning id"))[0].id;
});
afterAll(() => db.close());

describe("staff alerts", () => {
  it("send nothing when no contact email is configured", async () => {
    await order();
    expect(await alerts()).toHaveLength(0);
  });

  it("queue one alert per new order, repair and respect the on/off switch", async () => {
    await setStore({ contactEmail: "owner@shop.example" });
    const o = await order();
    await createRepairInquiry(db, { customerName: "Rita Alert", phone: "0300 1234567", deviceBrand: "Samsung", deviceModel: "A54", issue: "Cracked screen after a drop", preferredContact: "call" });
    const a = await alerts();
    expect(a.map((x) => x.payload.kind).sort()).toEqual(["order", "repair"]);
    expect(a.every((x) => x.recipient === "owner@shop.example")).toBe(true);
    expect(a.find((x) => x.payload.kind === "order")?.payload.ref).toBe(o.orderNumber);

    await db.query("delete from notification_outbox");
    await setStore({ contactEmail: "owner@shop.example", notifyStaffByEmail: false });
    await order();
    expect(await alerts()).toHaveLength(0);
  });

  it("never contain the customer's phone number, address or email", async () => {
    await db.query("delete from notification_outbox");
    await setStore({ contactEmail: "owner@shop.example" });
    await order();
    const text = JSON.stringify(await alerts());
    for (const secret of ["0300", "+92300", "Secret Street", "buyer@example.com", "Alert Customer"]) expect(text).not.toContain(secret);
  });

  it("are rendered and sent to the shop, once", async () => {
    const sent: { to: string; subject: string; text: string }[] = [];
    const r1 = await processOutbox(db, ctx, async (m) => { sent.push(m); });
    const r2 = await processOutbox(db, ctx, async (m) => { sent.push(m); });
    expect(r1.sent).toBeGreaterThanOrEqual(1);
    expect(r2.sent).toBe(0);
    const alert = sent.find((m) => m.to === "owner@shop.example" && m.subject.startsWith("New order"));
    expect(alert?.text).toContain("https://shop.example/admin/orders");
    expect(alert?.text).toContain("2 item(s)");
  });
});
