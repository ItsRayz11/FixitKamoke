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
  /** Finish/colour options: products sharing variantGroup are the same item in different finishes. */
  variantGroup: string | null;
  variantLabel: string | null;
  variantHex: string | null;
  variantRequired: boolean;
  /** Set on listing cards when the group was collapsed to one card: the other finishes, in display order. */
  finishes?: { hex: string | null; label: string; inStock: boolean }[];
}
export interface Category { id: string; slug: string; name: string; description: string | null }

export const effectivePrice = (p: Pick<Product, "price" | "salePrice">) => p.salePrice ?? p.price;

export { availability, type Availability } from "@/lib/domain/availability";

interface Row {
  id: string; slug: string; name: string; brand: string | null; category_id: string | null;
  category_name: string | null; category_slug: string | null; description: string; price: number;
  sale_price: number | null; sku: string | null; stock: number; specs: Record<string, string>;
  compatible_devices: string[]; warranty_info: string | null; image_url: string | null; image_alt: string | null;
  variant_group: string | null; variant_label: string | null; variant_hex: string | null; variant_required: boolean;
}

const SELECT = `select p.id, p.slug, p.name, p.brand, p.category_id, c.name as category_name, c.slug as category_slug,
  p.description, p.price, p.sale_price, p.sku, p.stock, p.specs, p.compatible_devices, p.warranty_info,
  p.variant_group, p.variant_label, p.variant_hex, p.variant_required,
  (select url from product_images i where i.product_id = p.id and i.kind = 'photo' order by sort_order limit 1) as image_url,
  (select alt from product_images i where i.product_id = p.id and i.kind = 'photo' order by sort_order limit 1) as image_alt
  from products p left join categories c on c.id = p.category_id`;

const map = (r: Row): Product => ({
  id: r.id, slug: r.slug, name: r.name, brand: r.brand, categoryId: r.category_id, categoryName: r.category_name,
  categorySlug: r.category_slug, description: r.description, price: r.price, salePrice: r.sale_price, sku: r.sku,
  stock: r.stock, specs: r.specs ?? {}, compatibleDevices: r.compatible_devices ?? [], warrantyInfo: r.warranty_info,
  image: r.image_url ? { url: r.image_url, alt: r.image_alt ?? r.name } : null,
  variantGroup: r.variant_group, variantLabel: r.variant_label, variantHex: r.variant_hex, variantRequired: r.variant_required,
});

export interface ProductFilter {
  q?: string;
  category?: string;
  min?: number;
  max?: number;
  inStock?: boolean;
  sort?: "newest" | "price_asc" | "price_desc" | "name";
  limit?: number;
  /** Show each finish group once (storefront listings). Leave off for admin and cart lookups. */
  collapse?: boolean;
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
  const list = rows.map(map);
  return f.collapse ? collapseFinishes(list) : list;
}

/**
 * One card per finish group. The card shown is the first finish that is in stock (otherwise the first one found), and it
 * carries the list of finishes so the card can show real colour dots. Only finishes that matched the filter are listed.
 */
export function collapseFinishes(list: Product[]): Product[] {
  const seen = new Map<string, number>();
  const out: Product[] = [];
  for (const p of list) {
    if (!p.variantGroup) { out.push(p); continue; }
    const at = seen.get(p.variantGroup);
    if (at === undefined) {
      seen.set(p.variantGroup, out.length);
      out.push({ ...p, finishes: [{ hex: p.variantHex, label: p.variantLabel ?? "", inStock: p.stock > 0 }] });
    } else {
      const head = out[at];
      head.finishes!.push({ hex: p.variantHex, label: p.variantLabel ?? "", inStock: p.stock > 0 });
      if (head.stock <= 0 && p.stock > 0) out[at] = { ...p, finishes: head.finishes };
    }
  }
  return out;
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
  return db.query<{ url: string; alt: string }>("select url, alt from product_images where product_id = $1 and kind = 'photo' order by sort_order", [productId]);
}

/** Turntable frames (kind "spin") for the 360-degree viewer, in rotation order. Empty when the owner has not added any. */
export async function getSpinFrames(productIds: string[]): Promise<Record<string, string[]>> {
  if (productIds.length === 0) return {};
  const db = await getDb();
  const rows = await db.query<{ product_id: string; url: string }>(
    "select product_id, url from product_images where product_id = any($1::uuid[]) and kind = 'spin' order by sort_order", [productIds]);
  const out: Record<string, string[]> = {};
  for (const r of rows) (out[r.product_id] ??= []).push(r.url);
  return out;
}

export interface Variant {
  id: string; slug: string; label: string; hex: string | null; price: number; salePrice: number | null; stock: number; sku: string | null;
  images: { url: string; alt: string }[];
}

/** Every published finish of this product's group (including itself), with its own real photos. Empty when the product has no finishes. */
export async function getVariants(p: Product): Promise<Variant[]> {
  if (!p.variantGroup) return [];
  const db = await getDb();
  const rows = await db.query<Row>(`${SELECT} where p.published and p.variant_group = $1 order by p.created_at, p.id`, [p.variantGroup]);
  if (rows.length === 0) return [];
  const imgs = await db.query<{ product_id: string; url: string; alt: string }>(
    "select product_id, url, alt from product_images where product_id = any($1::uuid[]) and kind = 'photo' order by sort_order", [rows.map((r) => r.id)]);
  return rows.map((r) => ({
    id: r.id, slug: r.slug, label: r.variant_label ?? "", hex: r.variant_hex, price: r.price, salePrice: r.sale_price, stock: r.stock, sku: r.sku,
    images: imgs.filter((i) => i.product_id === r.id).map((i) => ({ url: i.url, alt: i.alt })),
  }));
}

export { displayName } from "@/lib/domain/display";

export interface PopularCategory extends Category { inStock: number; views: number }

/**
 * Categories ranked by real signals: product page views in the last 30 days (count-only analytics), then how many items
 * are actually in stock. Categories with nothing published are left out. No invented popularity.
 */
export async function popularCategories(limit = 6): Promise<PopularCategory[]> {
  const db = await getDb();
  const rows = await db.query<{ id: string; slug: string; name: string; description: string | null; in_stock: number; views: number }>(`
    select c.id, c.slug, c.name, c.description,
      count(p.id) filter (where p.stock > 0)::int as in_stock,
      coalesce(sum(v.views), 0)::int as views
    from categories c
    join products p on p.category_id = c.id and p.published
    left join (
      select split_part(path, '/', 3) as slug, count(*) as views
      from analytics_events where name = 'product_view' and created_at > now() - interval '30 days' group by 1
    ) v on v.slug = p.slug
    group by c.id
    order by coalesce(sum(v.views), 0) desc, count(p.id) filter (where p.stock > 0) desc, c.sort_order, c.name
    limit $1`, [limit]);
  return rows.map((r) => ({ id: r.id, slug: r.slug, name: r.name, description: r.description, inStock: r.in_stock, views: r.views }));
}
