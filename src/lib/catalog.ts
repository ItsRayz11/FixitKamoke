import { getDb } from "@/lib/db";

export interface Product {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  description: string;
  price: number;
  salePrice: number | null;
  sku: string | null;
  stock: number;
  specs: Record<string, string>;
  compatibleDevices: string[];
  warrantyInfo: string | null;
  image: { url: string; alt: string } | null;
}
export interface Category { id: string; slug: string; name: string; description: string | null }

export const effectivePrice = (p: Pick<Product, "price" | "salePrice">) => p.salePrice ?? p.price;

export type Availability = "in_stock" | "low_stock" | "out_of_stock";
export const availability = (stock: number): Availability => (stock <= 0 ? "out_of_stock" : stock <= 3 ? "low_stock" : "in_stock");

interface Row {
  id: string; slug: string; name: string; brand: string | null; category_id: string | null;
  category_name: string | null; category_slug: string | null; description: string; price: number;
  sale_price: number | null; sku: string | null; stock: number; specs: Record<string, string>;
  compatible_devices: string[]; warranty_info: string | null; image_url: string | null; image_alt: string | null;
}

const SELECT = `select p.id, p.slug, p.name, p.brand, p.category_id, c.name as category_name, c.slug as category_slug,
  p.description, p.price, p.sale_price, p.sku, p.stock, p.specs, p.compatible_devices, p.warranty_info,
  (select url from product_images i where i.product_id = p.id order by sort_order limit 1) as image_url,
  (select alt from product_images i where i.product_id = p.id order by sort_order limit 1) as image_alt
  from products p left join categories c on c.id = p.category_id`;

const map = (r: Row): Product => ({
  id: r.id, slug: r.slug, name: r.name, brand: r.brand, categoryId: r.category_id, categoryName: r.category_name,
  categorySlug: r.category_slug, description: r.description, price: r.price, salePrice: r.sale_price, sku: r.sku,
  stock: r.stock, specs: r.specs ?? {}, compatibleDevices: r.compatible_devices ?? [], warrantyInfo: r.warranty_info,
  image: r.image_url ? { url: r.image_url, alt: r.image_alt ?? r.name } : null,
});

export interface ProductFilter {
  q?: string;
  category?: string;
  min?: number;
  max?: number;
  inStock?: boolean;
  sort?: "newest" | "price_asc" | "price_desc" | "name";
  limit?: number;
}

/** Lowercase and strip spaces/dashes so "i-phone 15", "IPHONE15" and "iphone 15" all match. */
export const squash = (s: string) => s.toLowerCase().replace(/[\s\-_/]+/g, "");

export async function listProducts(f: ProductFilter = {}): Promise<Product[]> {
  const db = await getDb();
  const where = ["p.published"];
  const params: unknown[] = [];
  const add = (v: unknown) => (params.push(v), `$${params.length}`);

  if (f.q?.trim()) {
    const p = add(`%${squash(f.q).replace(/[%_\\]/g, "\\$&")}%`);
    where.push(`regexp_replace(lower(p.name || ' ' || coalesce(p.brand,'') || ' ' || coalesce(p.sku,'') || ' ' || coalesce(c.name,'') || ' ' || array_to_string(p.compatible_devices,' ')), '[\\s\\-_/]+', '', 'g') like ${p}`);
  }
  if (f.category) where.push(`c.slug = ${add(f.category)}`);
  if (Number.isFinite(f.min)) where.push(`coalesce(p.sale_price, p.price) >= ${add(f.min)}`);
  if (Number.isFinite(f.max)) where.push(`coalesce(p.sale_price, p.price) <= ${add(f.max)}`);
  if (f.inStock) where.push("p.stock > 0");

  const order = {
    newest: "p.created_at desc",
    price_asc: "coalesce(p.sale_price, p.price) asc",
    price_desc: "coalesce(p.sale_price, p.price) desc",
    name: "p.name asc",
  }[f.sort ?? "newest"];

  const rows = await db.query<Row>(`${SELECT} where ${where.join(" and ")} order by ${order} limit ${Math.min(f.limit ?? 48, 100)}`, params);
  return rows.map(map);
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  const db = await getDb();
  const rows = await db.query<Row>(`${SELECT} where p.published and p.slug = $1`, [slug]);
  return rows[0] ? map(rows[0]) : null;
}

export async function getProductsByIds(ids: string[]): Promise<Product[]> {
  if (!ids.length) return [];
  const db = await getDb();
  const rows = await db.query<Row>(`${SELECT} where p.published and p.id = any($1::uuid[])`, [ids]);
  return rows.map(map);
}

export async function listCategories(): Promise<Category[]> {
  const db = await getDb();
  return db.query<Category>("select id, slug, name, description from categories order by sort_order, name");
}

export async function relatedProducts(p: Product, limit = 4): Promise<Product[]> {
  if (!p.categoryId) return [];
  const db = await getDb();
  const rows = await db.query<Row>(
    `${SELECT} where p.published and p.category_id = $1 and p.id <> $2 order by p.stock > 0 desc, p.created_at desc limit ${limit}`,
    [p.categoryId, p.id],
  );
  return rows.map(map);
}

/** Other products listed for at least one of the same phones. Real data only: nothing is shown unless the compatibility lists overlap. */
export async function compatibleProducts(p: Product, limit = 4): Promise<Product[]> {
  if (p.compatibleDevices.length === 0) return [];
  const db = await getDb();
  const rows = await db.query<Row>(
    `${SELECT} where p.published and p.id <> $1 and p.compatible_devices && $2::text[] order by p.stock > 0 desc, p.created_at desc limit ${limit}`,
    [p.id, p.compatibleDevices]);
  return rows.map(map);
}

/** Every photo for a product, in the order the owner set. */
export async function getProductImages(productId: string): Promise<{ url: string; alt: string }[]> {
  const db = await getDb();
  return db.query<{ url: string; alt: string }>("select url, alt from product_images where product_id = $1 order by sort_order", [productId]);
}
