import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/lib/db";
import { migrate } from "@/lib/db/migrate";
import { createOrder } from "@/lib/orders/create-order";
import { recordEvent } from "@/lib/events";
import { collapseFinishes, type Product } from "@/lib/catalog";
import { displayName } from "@/lib/domain/display";
import { approvedReviews, latestApprovedReviews } from "@/lib/reviews";

let db: Db;
let blue: string;
beforeAll(async () => {
  db = await createPgliteDb();
  await migrate(db);
  await db.query("insert into store_settings(key,value) values ('shipping',$1)", [JSON.stringify({ version: "t", unlistedCity: "manual_confirmation", zones: [{ id: "l", label: "L", cities: ["Kamoki"], fee: 0, freeThreshold: null, codAvailable: true, etaDays: null }] })]);
  const ins = async (slug: string, label: string, hex: string, stock: number) =>
    (await db.query<{ id: string }>(
      "insert into products(slug,name,price,stock,published,sku,variant_group,variant_label,variant_hex) values ($1,'Cable',500,$2,true,$1,'cable',$3,$4) returning id",
      [slug, stock, label, hex]))[0].id;
  await ins("cable-black", "Black", "#111111", 3);
  blue = await ins("cable-blue", "Blue", "#2563eb", 2);
});
afterAll(() => db.close());

const key = (n: number) => `variant-idempotency-key-${n}-${"x".repeat(8)}`;
const order = { customerName: "Test Customer", phone: "0300 1234567", city: "Kamoki", address: "Test street 1, Test area", paymentMethod: "cod" as const };

describe("finishes", () => {
  it("rejects a finish group without a finish name, and a malformed colour", async () => {
    await expect(db.query("insert into products(slug,name,price,variant_group) values ('bad1','Bad',1,'g')")).rejects.toThrow();
    await expect(db.query("insert into products(slug,name,price,variant_group,variant_label,variant_hex) values ('bad2','Bad',1,'g','X','red')")).rejects.toThrow();
  });

  it("keeps stock, price and the order record per finish", async () => {
    const o = await createOrder(db, { ...order, idempotencyKey: key(1), items: [{ productId: blue, quantity: 2 }] });
    expect(o.total).toBe(1000);
    const [item] = await db.query<{ product_name: string; sku: string }>("select oi.product_name, oi.sku from order_items oi join orders o on o.id = oi.order_id where o.order_number = $1", [o.orderNumber]);
    expect(item.product_name).toBe("Cable — Blue");
    expect(item.sku).toBe("cable-blue");
    const stock = await db.query<{ slug: string; stock: number }>("select slug, stock from products order by slug");
    expect(stock).toEqual([{ slug: "cable-black", stock: 3 }, { slug: "cable-blue", stock: 0 }]); // only the bought finish went down
  });

  it("cannot oversell a sold-out finish even though another finish has stock", async () => {
    await expect(createOrder(db, { ...order, idempotencyKey: key(2), items: [{ productId: blue, quantity: 1 }] })).rejects.toMatchObject({ code: "out_of_stock" });
  });
});

describe("listing and naming helpers", () => {
  const p = (slug: string, group: string | null, label: string | null, stock: number): Product => ({
    id: slug, slug, name: "Item", brand: null, categoryId: null, categoryName: null, categorySlug: null, description: "", price: 1, salePrice: null, sku: null,
    stock, specs: {}, compatibleDevices: [], warrantyInfo: null, image: null, variantGroup: group, variantLabel: label, variantHex: null, variantRequired: false,
  });
  it("shows a finish group once, preferring a finish that is in stock, with all finish dots", () => {
    const out = collapseFinishes([p("a", "g", "Black", 0), p("b", "g", "Blue", 4), p("c", null, null, 1)]);
    expect(out.map((x) => x.slug)).toEqual(["b", "c"]);
    expect(out[0].finishes?.map((f) => f.label)).toEqual(["Black", "Blue"]);
    expect(out[1].finishes).toBeUndefined();
  });
  it("names a finish in carts and orders", () => {
    expect(displayName("Cable", "Blue")).toBe("Cable — Blue");
    expect(displayName("Cable", null)).toBe("Cable");
  });
});

describe("funnel events", () => {
  it("stores only a name, a path and a coarse device class", async () => {
    await recordEvent(db, "listing_view", "/shop?q=secret", "mobile");
    await recordEvent(db, "product_click", "/shop", "tablet-with-weird-value");
    await recordEvent(db, "checkout_error", "/checkout", "desktop");
    const rows = await db.query<{ name: string; path: string; device: string | null }>("select name, path, device from analytics_events where name <> 'order_placed' order by id");
    expect(rows).toEqual([
      { name: "listing_view", path: "/shop", device: "mobile" }, // query string (could hold a search term) is dropped
      { name: "product_click", path: "/shop", device: null }, // unknown device values are not stored
      { name: "checkout_error", path: "/checkout", device: "desktop" },
    ]);
  });
  it("ignores unknown event names", async () => {
    await recordEvent(db, "evil" as never, "/x", "mobile");
    expect((await db.query("select 1 from analytics_events where name = 'evil'")).length).toBe(0);
  });
});

describe("reviews across finishes", () => {
  it("shows reviews of every finish in the group, tagged with the finish, and never pending ones", async () => {
    const [{ id: black }] = await db.query<{ id: string }>("select id from products where slug = 'cable-black'");
    await db.query("insert into reviews(product_id, author_name, rating, body, status) values ($1,'Ali K.',5,'Works perfectly with my phone.','approved'), ($2,'Sara M.',4,'Good cable, nice colour.','approved'), ($2,'Hidden P.',1,'Not yet moderated review.','pending')", [black, blue]);
    const onBlackPage = await approvedReviews(db, black);
    expect(onBlackPage.map((r) => `${r.authorName}:${r.finish}`).sort()).toEqual(["Ali K.:Black", "Sara M.:Blue"]);
    const latest = await latestApprovedReviews(db, 5);
    expect(latest.map((r) => r.productName).sort()).toEqual(["Cable — Black", "Cable — Blue"]);
  });
});
