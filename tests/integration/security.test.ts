import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/lib/db";
import { migrate } from "@/lib/db/migrate";

let db: Db;
beforeAll(async () => { db = await createPgliteDb(); await migrate(db); });
afterAll(() => db.close());

describe("database hardening", () => {
  it("has row level security on every table, so no table can be left open to an HTTP data API", async () => {
    const open = await db.query<{ tablename: string }>("select tablename from pg_tables where schemaname = 'public' and not rowsecurity order by 1");
    expect(open.map((t) => t.tablename)).toEqual([]);
  });

  it("migrations are applied once each and in order", async () => {
    const names = (await db.query<{ name: string }>("select name from schema_migrations order by name")).map((r) => r.name);
    expect(names).toEqual([...names].sort());
    expect(new Set(names).size).toBe(names.length);
    expect(names[0]).toBe("001_init.sql");
    expect(await migrate(db)).toEqual([]); // second run applies nothing
  });

  it("enforces money and stock rules in the database itself, not only in code", async () => {
    await expect(db.query("insert into products(slug,name,price,stock) values ('neg','N',-1,1)")).rejects.toThrow();
    await expect(db.query("insert into products(slug,name,price,stock) values ('neg2','N',10,-1)")).rejects.toThrow();
    await expect(db.query("insert into products(slug,name,price,sale_price,stock) values ('sale','N',10,10,1)")).rejects.toThrow(); // sale must be below price
    await expect(db.query("insert into orders(order_number,idempotency_key,tracking_token_hash,customer_name,phone,city,address,payment_method,subtotal,shipping_fee,total,shipping_status,shipping_policy_version,status) values ('X','k','h','n','p','c','a','cod',1,0,1,'quoted','v','shipped_to_mars')")).rejects.toThrow(); // status check
  });
});
