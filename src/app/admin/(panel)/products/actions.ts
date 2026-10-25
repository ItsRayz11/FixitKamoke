"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { assertAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { flash, slugify } from "@/lib/admin/flash";

const int = (label: string) => z.coerce.number({ message: `${label} must be a number` }).int(`${label} must be a whole number`).min(0, `${label} cannot be negative`);
/** Empty string means "not set"; anything else must be a non-negative whole number. */
const optInt = (label: string) =>
  z.string().trim().transform((v, ctx) => {
    if (v === "") return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) {
      ctx.addIssue({ code: "custom", message: `${label} must be a whole number` });
      return z.NEVER;
    }
    return n;
  });
const optText = z.string().trim().transform((v) => v || null);

const schema = z.object({
  name: z.string().trim().min(2, "Name is required").max(160),
  slug: z.string().trim().max(80),
  brand: optText,
  categoryId: z.string().trim().transform((v) => v || null),
  description: z.string().trim().max(4000),
  price: int("Price"),
  salePrice: optInt("Sale price"),
  sku: optText,
  stock: int("Stock"),
  published: z.boolean(),
  warranty: optText,
  weight: optInt("Weight"),
  specs: z.string().max(4000),
  devices: z.string().max(2000),
  images: z.string().max(4000),
});

function parseSpecs(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0 && line.slice(i + 1).trim()) out[line.slice(0, i).trim().slice(0, 60)] = line.slice(i + 1).trim().slice(0, 200);
  }
  return out;
}

function parseImages(text: string): { url: string; alt: string }[] {
  const out: { url: string; alt: string }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const [u, ...alt] = line.split("|");
    const url = u?.trim();
    if (!url) continue;
    try {
      if (new URL(url).protocol !== "https:") throw new Error();
    } catch {
      throw new Error(`Image URL must start with https:// — "${url.slice(0, 60)}"`);
    }
    out.push({ url, alt: alt.join("|").trim().slice(0, 200) });
  }
  return out.slice(0, 10);
}

export interface ProductFormState { error?: string; values?: Record<string, string | boolean> }

export async function saveProductAction(_prev: ProductFormState, form: FormData): Promise<ProductFormState> {
  const admin = await assertAdmin("manager");
  // Echo what the user typed so a rejected save never wipes the form.
  const values: Record<string, string | boolean> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") values[k] = v;
  values.published = form.get("published") === "on";
  const fail = (error: string): ProductFormState => ({ error, values });

  const id = String(form.get("id") ?? "");
  const parsed = schema.safeParse({
    name: form.get("name"), slug: form.get("slug") ?? "", brand: form.get("brand") ?? "", categoryId: form.get("categoryId") ?? "",
    description: form.get("description") ?? "", price: form.get("price"), salePrice: form.get("salePrice") ?? "", sku: form.get("sku") ?? "",
    stock: form.get("stock"), published: form.get("published") === "on", warranty: form.get("warranty") ?? "", weight: form.get("weight") ?? "",
    specs: form.get("specs") ?? "", devices: form.get("devices") ?? "", images: form.get("images") ?? "",
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const d = parsed.data;
  if (d.salePrice !== null && d.salePrice >= d.price) return fail("Sale price must be lower than the regular price.");

  let images: { url: string; alt: string }[] = [];
  try { images = parseImages(d.images); } catch (e) { return fail((e as Error).message); }

  const slug = slugify(d.slug || d.name);
  if (!slug) return fail("Could not make a web address from that name.");
  const devices = d.devices.split(/[\n,]/).map((x) => x.trim()).filter(Boolean).slice(0, 60);
  const db = await getDb();

  let savedId = id;
  try {
    await db.tx(async (q) => {
      if (id) {
        const prev = await q.query<{ price: number; sale_price: number | null; stock: number; published: boolean }>("select price, sale_price, stock, published from products where id = $1 for update", [id]);
        if (!prev[0]) throw new Error("Product not found");
        await q.query(
          `update products set name=$2, slug=$3, brand=$4, category_id=$5, description=$6, price=$7, sale_price=$8, sku=$9, stock=$10, published=$11,
             specs=$12, compatible_devices=$13, warranty_info=$14, weight_grams=$15, updated_at=now() where id=$1`,
          [id, d.name, slug, d.brand, d.categoryId, d.description, d.price, d.salePrice, d.sku, d.stock, d.published, JSON.stringify(parseSpecs(d.specs)), devices, d.warranty, d.weight],
        );
        await audit(admin.email, "product_updated", "product", id, { before: prev[0], after: { price: d.price, sale_price: d.salePrice, stock: d.stock, published: d.published } }, q);
      } else {
        const r = await q.query<{ id: string }>(
          `insert into products(name, slug, brand, category_id, description, price, sale_price, sku, stock, published, specs, compatible_devices, warranty_info, weight_grams)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id`,
          [d.name, slug, d.brand, d.categoryId, d.description, d.price, d.salePrice, d.sku, d.stock, d.published, JSON.stringify(parseSpecs(d.specs)), devices, d.warranty, d.weight],
        );
        savedId = r[0].id;
        await audit(admin.email, "product_created", "product", savedId, { name: d.name, price: d.price, stock: d.stock }, q);
      }
      await q.query("delete from product_images where product_id = $1", [savedId]);
      for (const [i, img] of images.entries()) await q.query("insert into product_images(product_id, url, alt, sort_order) values ($1,$2,$3,$4)", [savedId, img.url, img.alt || d.name, i]);
    });
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    return fail(/duplicate key/.test(m) ? "That web address (slug) or SKU is already used by another product." : m === "Product not found" ? m : "Could not save the product.");
  }
  revalidatePath("/shop"); revalidatePath("/");
  flash(`/admin/products/${savedId}`, { ok: "Product saved." });
}

export async function adjustStockAction(form: FormData) {
  const admin = await assertAdmin("manager");
  const id = String(form.get("id") ?? "");
  const stock = int("Stock").safeParse(form.get("stock"));
  if (!stock.success || !id) flash("/admin/inventory", { error: stock.success ? "Missing product" : stock.error.issues[0].message });
  const db = await getDb();
  const prev = await db.query<{ stock: number; name: string }>("select stock, name from products where id = $1", [id]);
  if (!prev[0]) flash("/admin/inventory", { error: "Product not found." });
  await db.query("update products set stock = $2, updated_at = now() where id = $1", [id, stock.data!]);
  await audit(admin.email, "stock_adjusted", "product", id, { from: prev[0].stock, to: stock.data, name: prev[0].name });
  flash("/admin/inventory", { ok: `Stock for “${prev[0].name}” set to ${stock.data}.` });
}

export async function deleteProductAction(form: FormData) {
  const admin = await assertAdmin("owner");
  const id = String(form.get("id") ?? "");
  const db = await getDb();
  const p = await db.query<{ name: string }>("select name from products where id = $1", [id]);
  if (!p[0]) flash("/admin/products", { error: "Product not found." });
  // Order history keeps its own snapshot, so deleting is safe; unpublishing is the gentler default.
  await db.query("delete from products where id = $1", [id]);
  await audit(admin.email, "product_deleted", "product", id, { name: p[0].name });
  revalidatePath("/shop");
  flash("/admin/products", { ok: `Deleted “${p[0].name}”. Past orders keep their item records.` });
}
