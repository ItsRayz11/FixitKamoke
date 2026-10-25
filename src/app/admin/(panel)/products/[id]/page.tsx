import { notFound } from "next/navigation";
import { requireAdmin, hasRole } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { listCategories } from "@/lib/catalog";
import { Banner, Submit } from "@/components/admin/ui";
import { ProductForm } from "@/components/admin/product-form";
import { deleteProductAction } from "../actions";

export const dynamic = "force-dynamic";

interface Row {
  id: string; name: string; slug: string; brand: string | null; category_id: string | null; description: string; price: number; sale_price: number | null;
  sku: string | null; stock: number; published: boolean; warranty_info: string | null; weight_grams: number | null; specs: Record<string, string>; compatible_devices: string[];
}

export default async function EditProduct({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const admin = await requireAdmin("manager");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await getDb();
  const rows = await db.query<Row>("select * from products where id = $1", [id]);
  const p = rows[0];
  if (!p) notFound();
  const imgs = await db.query<{ url: string; alt: string }>("select url, alt from product_images where product_id = $1 order by sort_order", [id]);
  return (
    <div>
      <h1 className="mb-4 text-2xl font-extrabold">Edit product</h1>
      <Banner ok={sp.ok} error={sp.error} />
      <ProductForm
        categories={await listCategories()}
        v={{
          id: p.id, name: p.name, slug: p.slug, brand: p.brand ?? "", categoryId: p.category_id ?? "", description: p.description, price: p.price, salePrice: p.sale_price ?? "",
          sku: p.sku ?? "", stock: p.stock, published: p.published, warranty: p.warranty_info ?? "", weight: p.weight_grams ?? "",
          specs: Object.entries(p.specs ?? {}).map(([k, v]) => `${k}: ${v}`).join("\n"), devices: (p.compatible_devices ?? []).join(", "),
          images: imgs.map((i) => `${i.url}|${i.alt}`).join("\n"),
        }}
      />
      {hasRole(admin, "owner") && (
        <form action={deleteProductAction} className="mt-10 max-w-3xl border-t border-line pt-4">
          <input type="hidden" name="id" value={p.id} />
          <p className="mb-2 text-sm text-muted">Deleting removes the product from the store. Past orders keep their records. Unpublishing (above) is usually safer.</p>
          <Submit danger>Delete product</Submit>
        </form>
      )}
    </div>
  );
}
