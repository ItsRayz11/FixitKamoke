import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { createPostgresDb, type Db } from "@/lib/db";
import { migrate } from "@/lib/db/migrate";
import { createOrder, getShippingConfig } from "@/lib/orders/create-order";
import { audit } from "@/lib/audit";
import { createRepairInquiry } from "@/lib/repairs/repairs";
import { processOutbox } from "@/lib/email/outbox";
import { importStarterArticles, savePost } from "@/lib/blog";

/**
 * Every other integration test uses the embedded database directly. Production uses the `postgres` driver over a real
 * Postgres connection, and the two behave differently (for example how JSON and arrays are sent). This file runs the
 * important flows through the production driver, against the same engine served over a real socket.
 */
let mem: PGlite;
let server: PGLiteSocketServer;
let db: Db;

beforeAll(async () => {
  mem = await PGlite.create();
  server = new PGLiteSocketServer({ db: mem, port: 54330, host: "127.0.0.1" });
  await server.start();
  process.env.DATABASE_POOL_MAX = "1"; // this socket server serves one connection at a time
  db = await createPostgresDb("postgresql://postgres:postgres@127.0.0.1:54330/postgres");
  await migrate(db);
}, 60_000);
afterAll(async () => {
  await db?.close();
  await server?.stop();
  await mem?.close();
});

describe("production driver parity", () => {
  it("stores JSON as JSON objects, not as escaped strings", async () => {
    await db.query("insert into store_settings(key,value) values ('t', $1)", [JSON.stringify({ a: 1, nested: { ok: true } })]);
    const row = (await db.query<{ value: unknown; kind: string }>("select value, jsonb_typeof(value) as kind from store_settings where key='t'"))[0];
    expect(row.kind).toBe("object");
    expect(row.value).toEqual({ a: 1, nested: { ok: true } });
  });

  it("places an order end to end: delivery config (JSON), text[] columns, transaction, stock", async () => {
    await db.query("insert into store_settings(key,value) values ('shipping',$1)", [JSON.stringify({
      version: "driver-v1", unlistedCity: "manual_confirmation",
      zones: [{ id: "l", label: "Local", cities: ["Kamoki"], fee: 0, freeThreshold: null, codAvailable: true, etaDays: [1, 2] }],
    })]);
    const cfg = await getShippingConfig(db);
    expect(cfg?.zones[0].cities).toEqual(["Kamoki"]);

    const pid = (await db.query<{ id: string }>(
      "insert into products(slug,name,price,stock,published,specs,compatible_devices) values ('p','P',250,5,true,$1,$2) returning id",
      [JSON.stringify({ Length: "1 m" }), ["Galaxy A54", "iPhone 13"]]))[0].id;
    const stored = (await db.query<{ specs: Record<string, string>; compatible_devices: string[] }>("select specs, compatible_devices from products where id=$1", [pid]))[0];
    expect(stored.specs).toEqual({ Length: "1 m" });
    expect(stored.compatible_devices).toEqual(["Galaxy A54", "iPhone 13"]);

    const o = await createOrder(db, { customerName: "Driver Test", phone: "0300 1234567", email: "d@example.com", city: "Kamoki", address: "House 1, Street 2", paymentMethod: "cod", idempotencyKey: "driver-parity-key-1-xxxxxxxx", items: [{ productId: pid, quantity: 2 }] });
    expect(o.total).toBe(500);
    expect((await db.query<{ stock: number }>("select stock from products where id=$1", [pid]))[0].stock).toBe(3);
    const retry = await createOrder(db, { customerName: "Driver Test", phone: "0300 1234567", city: "Kamoki", address: "House 1, Street 2", paymentMethod: "cod", idempotencyKey: "driver-parity-key-1-xxxxxxxx", items: [{ productId: pid, quantity: 2 }] });
    expect(retry.duplicate).toBe(true);
    expect((await db.query<{ stock: number }>("select stock from products where id=$1", [pid]))[0].stock).toBe(3);
  });

  it("a rolled-back order leaves no trace (real transaction semantics)", async () => {
    const pid = (await db.query<{ id: string }>("select id from products where slug='p'"))[0].id;
    const before = (await db.query<{ stock: number }>("select stock from products where id=$1", [pid]))[0].stock;
    await expect(createOrder(db, { customerName: "Rollback", phone: "0300 1234567", city: "Kamoki", address: "House 1, Street 2", paymentMethod: "cod", idempotencyKey: "driver-parity-key-2-xxxxxxxx", items: [{ productId: pid, quantity: 1 }], couponCode: "NOPE" })).rejects.toMatchObject({ code: "bad_coupon" });
    expect((await db.query<{ stock: number }>("select stock from products where id=$1", [pid]))[0].stock).toBe(before);
    expect((await db.query("select 1 from orders where idempotency_key='driver-parity-key-2-xxxxxxxx'")).length).toBe(0);
  });

  it("audit details and email payloads round-trip as objects", async () => {
    await audit("tester", "driver_check", "thing", "1", { from: 1, to: 2 }, db);
    expect((await db.query<{ detail: unknown }>("select detail from audit_events where action='driver_check'"))[0].detail).toEqual({ from: 1, to: 2 });

    await createRepairInquiry(db, { customerName: "Rita Driver", phone: "0300 1234567", email: "rita@example.com", deviceBrand: "Samsung", deviceModel: "A1", issue: "Broken screen here", preferredContact: "call" });
    const sent: string[] = [];
    const r = await processOutbox(db, { baseUrl: "https://x.example", whatsappNumber: null, contactEmail: null }, async (m) => { sent.push(m.subject); });
    expect(r.sent).toBeGreaterThanOrEqual(1);
    expect(sent.some((s) => s.includes("repair request RP-"))).toBe(true);
  });

  it("blog text[] columns and JSON-free upserts work", async () => {
    expect(await importStarterArticles(db)).toBeGreaterThan(0);
    const id = (await db.query<{ id: string }>("select id from blog_posts limit 1"))[0].id;
    const cur = (await db.query<{ slug: string; title: string; excerpt: string; body_md: string }>("select slug,title,excerpt,body_md from blog_posts where id=$1", [id]))[0];
    await savePost(db, id, { title: cur.title, slug: cur.slug, excerpt: cur.excerpt, bodyMd: cur.body_md, metaDescription: null, author: "Team", coverUrl: null, productSlugs: ["p"], publish: true, reviewed: true });
    expect((await db.query<{ product_slugs: string[] }>("select product_slugs from blog_posts where id=$1", [id]))[0].product_slugs).toEqual(["p"]);
  });
});
