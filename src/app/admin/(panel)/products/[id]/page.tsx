import { cloudinaryConfig } from "@/lib/cloudinary";
import { notFound } from "next/navigation";
import { requireAdmin, hasRole } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { listCategories } from "@/lib/catalog";
import { Banner } from "@/components/admin/ui";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { ProductForm } from "@/components/admin/product-form";
import { deleteProductAction } from "../actions";

export const dynamic = "force-dynamic";

interface Row {
  id: string; name: string; slug: string; brand: string | null; category_id: string | null; description: string; price: number; sale_price: number | null;
  sku: string | null; stock: number; published: boolean; warranty_info: string | null; weight_grams: number | null; specs: Record<string, string>; compatible_devices: string[];
  variant_group: string | null; variant_label: string | null; variant_hex: string | null; variant_required: boolean;
}

export default async function EditProduct({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const admin = await requireAdmin("manager");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await getDb();
  const rows = await db.query<Row>("select * from products where id = $1", [id]);
  const p = rows[0];
  if (!p) notFound();
  const imgs = await db.query<{ url: string; alt: string }>("select url, alt from product_images where product_id = $1 and kind = 'photo' order by sort_order", [id]);
  const spin = await db.query<{ url: string }>("select url from product_images where product_id = $1 and kind = 'spin' order by sort_order", [id]);
  return (
    <div>
      <h1 className="mb-4 text-2xl font-extrabold">Edit product</h1>
      <Banner ok={sp.ok} error={sp.error} />
      <ProductForm
        categories={await listCategories()}
        uploads={cloudinaryConfig() !== null}
        v={{
          id: p.id, name: p.name, slug: p.slug, brand: p.brand ?? "", categoryId: p.category_id ?? "", description: p.description, price: p.price, salePrice: p.sale_price ?? "",
          sku: p.sku ?? "", stock: p.stock, published: p.published, warranty: p.warranty_info ?? "", weight: p.weight_grams ?? "",
          specs: Object.entries(p.specs ?? {}).map(([k, v]) => `${k}: ${v}`).join("\n"), devices: (p.compatible_devices ?? []).join(", "),
          images: imgs.map((i) => `${i.url}|${i.alt}`).join("\n"), spin: spin.map((s) => s.url).join("\n"),
          variantGroup: p.variant_group ?? "", variantLabel: p.variant_label ?? "", variantHex: p.variant_hex ?? "", variantRequired: p.variant_required,
        }}
      />
      {hasRole(admin, "owner") && (
        <div className="mt-10 max-w-3xl border-t border-line pt-4">
          <p className="mb-2 text-sm text-muted">Deleting removes the product from the store. Past orders keep their records. Unpublishing (above) is usually safer.</p>
          <ConfirmButton action={deleteProductAction} fields={{ id: p.id }} title={`Delete “${p.name}”?`} description="This removes the product and its photos from the store. Past orders keep their own copy of what was bought. This cannot be undone." confirmLabel="Delete product" className="min-h-11 rounded-[var(--radius-sm)] bg-danger px-5 text-sm font-semibold text-white">Delete product</ConfirmButton>
        </div>
      )}
    </div>
  );
}
