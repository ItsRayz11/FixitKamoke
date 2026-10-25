import type { Db } from "@/lib/db";

/**
 * DEMO DATA ONLY. Everything here is a placeholder for development and automated tests.
 * Names are prefixed "DEMO" so none of it can be mistaken for real inventory. Refused in production.
 */
export async function seedDemo(db: Db): Promise<{ products: number }> {
  if (process.env.NODE_ENV === "production") throw new Error("Demo seeding is disabled in production");

  await db.query(
    `insert into store_settings(key, value) values ('shipping', $1)
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [JSON.stringify({
      version: "demo-v1",
      unlistedCity: "manual_confirmation",
      zones: [
        { id: "local", label: "Kamoki (demo)", cities: ["Kamoki"], fee: 0, freeThreshold: null, codAvailable: true, etaDays: [1, 2] },
        { id: "punjab", label: "Punjab (demo)", cities: ["Lahore", "Gujranwala", "Faisalabad"], fee: 300, freeThreshold: null, codAvailable: true, etaDays: [3, 5] },
      ],
    })],
  );

  const cats: [string, string][] = [["chargers-cables", "Chargers & Cables"], ["cases-protection", "Cases & Protection"], ["audio", "Audio"], ["power-banks", "Power Banks"]];
  const catId: Record<string, string> = {};
  for (const [i, [slug, name]] of cats.entries()) {
    const r = await db.query<{ id: string }>(
      "insert into categories(slug,name,sort_order) values ($1,$2,$3) on conflict (slug) do update set name = excluded.name returning id",
      [slug, name, i],
    );
    catId[slug] = r[0].id;
  }

  const items: [string, string, string, number, number | null, number, string[]][] = [
    ["demo-usb-c-cable", "DEMO USB-C Cable 1m", "chargers-cables", 600, 450, 25, ["Samsung Galaxy A54", "Infinix Note 30"]],
    ["demo-fast-charger-20w", "DEMO 20W Fast Charger", "chargers-cables", 1800, null, 3, ["iPhone 13", "iPhone 14"]],
    ["demo-clear-case", "DEMO Clear Phone Case", "cases-protection", 700, null, 12, ["iPhone 13"]],
    ["demo-glass-protector", "DEMO Tempered Glass Protector", "cases-protection", 400, null, 0, ["Samsung Galaxy A54"]],
    ["demo-earphones", "DEMO Wired Earphones", "audio", 900, 750, 8, []],
    ["demo-power-bank-10000", "DEMO 10000mAh Power Bank", "power-banks", 3500, null, 5, []],
  ];
  for (const [slug, name, cat, price, sale, stock, devices] of items) {
    await db.query(
      `insert into products(slug,name,brand,category_id,description,price,sale_price,sku,stock,published,specs,compatible_devices,warranty_info)
       values ($1,$2,'DEMO',$3,$4,$5,$6,$1,$7,true,$8,$9,null)
       on conflict (slug) do update set price = excluded.price, sale_price = excluded.sale_price, stock = excluded.stock, published = true`,
      [slug, name, catId[cat], "Placeholder demo product used for development and tests. Not a real item.", price, sale, stock,
        JSON.stringify({ "Demo spec": "Placeholder value" }), devices],
    );
  }
  await db.query("insert into coupons(code,type,value,min_subtotal) values ('DEMO10','percent',10,1000) on conflict (code) do nothing");
  return { products: items.length };
}
