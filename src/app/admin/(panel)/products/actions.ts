"use server";

import { z } from "zod";
import { resolveSaleWindow, type SaleWindow } from "@/lib/domain/sale";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { assertAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { flash, slugify } from "@/lib/admin/flash";
import { releaseRestockedAlerts } from "@/lib/stock-alerts";
import { adjustStock, ledgerStockChange } from "@/lib/finance/stock";

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
  saleStarts: z.string().trim().max(10),
  saleEnds: z.string().trim().max(10),
  saleLength: z.string().trim().max(3),
  saleTimer: z.boolean(),
  sku: optText,
  stock: int("Stock"),
  status: z.enum(["draft", "active", "archived"]),
  seoTitle: z.string().trim().max(70, "The page title can be at most 70 characters."),
  seoDescription: z.string().trim().max(160, "The page description can be at most 160 characters."),
  warranty: optText,
  weight: optInt("Weight"),
  specs: z.string().max(4000),
  devices: z.string().max(2000),
  images: z.string().max(4000),
  spin: z.string().max(20000),
  variantGroup: z.string().trim().max(80),
  variantLabel: optText,
  variantHex: z.string().trim().refine((v) => v === "" || /^#[0-9a-fA-F]{6}$/.test(v), "Finish colour must look like #A7B0BC"),
  variantRequired: z.boolean(),
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

/** Turntable frames: one https link per line, in turning order. Either none, or between 8 and 72. */
function parseSpin(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const url = line.trim();
    if (!url) continue;
    try {
      if (new URL(url).protocol !== "https:") throw new Error();
    } catch {
      throw new Error(`Turntable frame links must start with https:// — "${url.slice(0, 60)}"`);
    }
    out.push(url);
  }
  if (out.length > 0 && out.length < 8) throw new Error(`A 360° view needs at least 8 frames (you gave ${out.length}). Leave it empty if you have not shot one.`);
  if (out.length > 72) throw new Error("A 360° view can have at most 72 frames.");
  return out;
}

export interface ProductFormState { error?: string; values?: Record<string, string | boolean> }

export async function saveProductAction(_prev: ProductFormState, form: FormData): Promise<ProductFormState> {
  const admin = await assertAdmin("manager");
  // Echo what the user typed so a rejected save never wipes the form.
  const values: Record<string, string | boolean> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") values[k] = v;
  const fail = (error: string): ProductFormState => ({ error, values });

  const id = String(form.get("id") ?? "");
  const parsed = schema.safeParse({
    name: form.get("name"), slug: form.get("slug") ?? "", brand: form.get("brand") ?? "", categoryId: form.get("categoryId") ?? "",
    description: form.get("description") ?? "", price: form.get("price"), salePrice: form.get("salePrice") ?? "", saleStarts: form.get("saleStarts") ?? "", saleEnds: form.get("saleEnds") ?? "", saleLength: form.get("saleLength") ?? "", saleTimer: form.get("saleTimer") === "on", sku: form.get("sku") ?? "",
    stock: form.get("stock"), status: form.get("status") ?? (form.get("published") === "on" ? "active" : "draft"), seoTitle: form.get("seoTitle") ?? "", seoDescription: form.get("seoDescription") ?? "", warranty: form.get("warranty") ?? "", weight: form.get("weight") ?? "",
    specs: form.get("specs") ?? "", devices: form.get("devices") ?? "", images: form.get("images") ?? "", spin: form.get("spin") ?? "",
    variantGroup: form.get("variantGroup") ?? "", variantLabel: form.get("variantLabel") ?? "", variantHex: form.get("variantHex") ?? "",
    variantRequired: form.get("variantRequired") === "on",
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const d = parsed.data;
  const published = d.status === "active";
  const archived = d.status === "archived";
  if (d.salePrice !== null && d.salePrice >= d.price) return fail("Sale price must be lower than the regular price.");
  let prevWindow: SaleWindow ={ starts: null, ends: null };
  if (id) {
    const w = await (await getDb()).query<{ sale_starts_at: string | null; sale_ends_at: string | null }>("select sale_starts_at, sale_ends_at from products where id = $1", [id]);
    if (w[0]) prevWindow = { starts: w[0].sale_starts_at ? new Date(w[0].sale_starts_at) : null, ends: w[0].sale_ends_at ? new Date(w[0].sale_ends_at) : null };
  }
  const win = resolveSaleWindow({ length: d.saleLength, startsDate: d.saleStarts, endsDate: d.saleEnds, prev: prevWindow });
  if ("error" in win) return fail(win.error);
  const saleStarts = win.starts, saleEnds = win.ends;
  if ((saleStarts || saleEnds) && d.salePrice === null) return fail("Enter a sale price, or clear the sale dates.");
  if (d.saleTimer && d.salePrice === null) return fail("A countdown timer needs a sale price.");
  if (d.saleTimer && !saleEnds) return fail("A countdown timer needs an end: pick a sale length or an end date.");
  const saleTimer = d.saleTimer && d.salePrice !== null;
  const variantGroup = d.variantGroup ? slugify(d.variantGroup) : null;
  if (d.variantGroup && !variantGroup) return fail("Could not make a finish group name from that text.");
  if (variantGroup && !d.variantLabel) return fail("Give this finish a name (for example Titanium Grey), or clear the finish group.");
  if (!variantGroup && (d.variantLabel || d.variantHex)) return fail("Finish name and colour only apply when a finish group is set.");
  const variantHex = variantGroup && d.variantHex ? d.variantHex.toLowerCase() : null;
  const variantLabel = variantGroup ? d.variantLabel : null;
  const variantRequired = Boolean(variantGroup) && d.variantRequired;

  let images: { url: string; alt: string }[] = [];
  let spin: string[] = [];
  try { images = parseImages(d.images); spin = parseSpin(d.spin); } catch (e) { return fail((e as Error).message); }

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
             specs=$12, compatible_devices=$13, warranty_info=$14, weight_grams=$15, variant_group=$16, variant_label=$17, variant_hex=$18, variant_required=$19, sale_starts_at=$20, sale_ends_at=$21, seo_title=$22, seo_description=$23, archived=$24, sale_timer=$25, updated_at=now() where id=$1`,
          [id, d.name, slug, d.brand, d.categoryId, d.description, d.price, d.salePrice, d.sku, d.stock, published, JSON.stringify(parseSpecs(d.specs)), devices, d.warranty, d.weight, variantGroup, variantLabel, variantHex, variantRequired, saleStarts, saleEnds, d.seoTitle || null, d.seoDescription || null, archived, saleTimer],
        );
        await ledgerStockChange(q, id, d.stock - prev[0].stock, { key: `product:${id}:edit:${Date.now()}`, refType: "product", refId: id, actor: admin.email, note: "Edited on the product form" });
        await audit(admin.email, "product_updated", "product", id, { before: prev[0], after: { price: d.price, sale_price: d.salePrice, stock: d.stock, published: published } }, q);
      } else {
        const r = await q.query<{ id: string }>(
          `insert into products(name, slug, brand, category_id, description, price, sale_price, sku, stock, published, specs, compatible_devices, warranty_info, weight_grams, variant_group, variant_label, variant_hex, variant_required, sale_starts_at, sale_ends_at, seo_title, seo_description, archived, sale_timer)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24) returning id`,
          [d.name, slug, d.brand, d.categoryId, d.description, d.price, d.salePrice, d.sku, d.stock, published, JSON.stringify(parseSpecs(d.specs)), devices, d.warranty, d.weight, variantGroup, variantLabel, variantHex, variantRequired, saleStarts, saleEnds, d.seoTitle || null, d.seoDescription || null, archived, saleTimer],
        );
        savedId = r[0].id;
        await ledgerStockChange(q, savedId, d.stock, { key: `product:${savedId}:initial`, refType: "product", refId: savedId, actor: admin.email, note: "Stock entered when the product was created" });
        await audit(admin.email, "product_created", "product", savedId, { name: d.name, price: d.price, stock: d.stock }, q);
      }
      await q.query("delete from product_images where product_id = $1", [savedId]);
      for (const [i, img] of images.entries()) await q.query("insert into product_images(product_id, url, alt, sort_order, kind) values ($1,$2,$3,$4,'photo')", [savedId, img.url, img.alt || d.name, i]);
      for (const [i, url] of spin.entries()) await q.query("insert into product_images(product_id, url, alt, sort_order, kind) values ($1,$2,$3,$4,'spin')", [savedId, url, `${d.name}, turntable frame ${i + 1}`, i]);
    });
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    return fail(/duplicate key/.test(m) ? "That web address (slug) or SKU is already used by another product." : m === "Product not found" ? m : "Could not save the product.");
  }
  await releaseRestockedAlerts(db);
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
  await db.tx((q) => adjustStock(q, id, stock.data!, { key: `adjust:${id}:${Date.now()}`, refType: "product", refId: id, actor: admin.email, note: "Set on the Inventory page" }));
  await audit(admin.email, "stock_adjusted", "product", id, { from: prev[0].stock, to: stock.data, name: prev[0].name });
  await releaseRestockedAlerts(db);
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
