import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/lib/db";
import { migrate } from "@/lib/db/migrate";
import { policiesForProduct } from "@/lib/policies";

let db: Db;
let p1: string;
const mkPolicy = async (kind: string, name: string, isDefault = false) =>
  (await db.query<{ id: string }>("insert into product_policies(kind,name,body,is_default) values ($1,$2,'Body text',$3) returning id", [kind, name, isDefault]))[0].id;

beforeAll(async () => {
  db = await createPgliteDb();
  await migrate(db);
  p1 = (await db.query<{ id: string }>("insert into products(slug,name,price,stock,published) values ('pol-1','Pol 1',100,5,true) returning id"))[0].id;
});
afterAll(() => db.close());

describe("return and warranty policies", () => {
  it("a product with no choice and no default shows none", async () => {
    expect(await policiesForProduct(p1, db)).toEqual({ return: null, warranty: null });
  });

  it("falls back to the default of each kind, and a chosen policy wins over the default", async () => {
    const retDefault = await mkPolicy("return", "7-day return", true);
    const warDefault = await mkPolicy("warranty", "6-month warranty", true);
    const noReturn = await mkPolicy("return", "No return");
    let r = await policiesForProduct(p1, db);
    expect(r.return?.id).toBe(retDefault);
    expect(r.warranty?.id).toBe(warDefault);
    await db.query("update products set return_policy_id = $2 where id = $1", [p1, noReturn]);
    r = await policiesForProduct(p1, db);
    expect(r.return?.name).toBe("No return");
    expect(r.warranty?.id).toBe(warDefault); // the other kind still uses its default
  });

  it("allows only one default per kind and unique names", async () => {
    await expect(mkPolicy("return", "Another default", true)).rejects.toThrow();
    await expect(mkPolicy("return", "NO RETURN")).rejects.toThrow(); // same name, different case
    await mkPolicy("warranty", "No return"); // same name in the other kind is fine
  });

  it("deleting a chosen policy sends the product back to the default instead of breaking it", async () => {
    const chosen = (await db.query<{ return_policy_id: string }>("select return_policy_id from products where id = $1", [p1]))[0].return_policy_id;
    await db.query("delete from product_policies where id = $1", [chosen]);
    const r = await policiesForProduct(p1, db);
    expect(r.return?.name).toBe("7-day return");
    expect((await db.query<{ return_policy_id: string | null }>("select return_policy_id from products where id = $1", [p1]))[0].return_policy_id).toBeNull();
  });
});
