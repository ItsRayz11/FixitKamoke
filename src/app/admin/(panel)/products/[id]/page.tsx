import { instantToPktDate, saleStatus, formatPkt, longDuration } from "@/lib/domain/sale";
import { financePermsOf } from "@/lib/finance/perms";
import { listPolicies } from "@/lib/policies";
import { cloudinaryConfig } from "@/lib/cloudinary";
import { notFound } from "next/navigation";
import { requireAdmin, hasRole } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { listCategories } from "@/lib/catalog";
import { Banner } from "@/components/admin/ui";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { ProductForm, type SaleInfo } from "@/components/admin/product-form";
import { deleteProductAction } from "../actions";

export const dynamic = "force-dynamic";

interface Row {
  id: string; name: string; slug: string; brand: string | null; category_id: string | null; description: string; price: number; sale_price: number | null; sale_starts_at: string | null; sale_ends_at: string | null;
  sku: string | null; stock: number; published: boolean; warranty_info: string | null; weight_grams: number | null; specs: Record<string, string>; compatible_devices: string[];
  variant_group: string | null; variant_label: string | null; variant_hex: string | null; variant_required: boolean;
  archived: boolean; return_policy_id: string | null; warranty_policy_id: string | null; sale_timer: boolean; avg_cost: string | null; unvalued_units: number; seo_title: string | null; seo_description: string | null;
}

export default async function EditProduct({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string; tab?: string }> }) {
  const admin = await requireAdmin("manager");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await getDb();
  const rows = await db.query<Row>("select * from products where id = $1", [id]);
  const p = rows[0];
  if (!p) notFound();
  const perms = await financePermsOf(admin);
  const showCost = admin.role === "owner" || perms.includes("finance_costs");
  const startsAt = p.sale_starts_at ? new Date(p.sale_starts_at) : null;
  const endsAt = p.sale_ends_at ? new Date(p.sale_ends_at) : null;
  const status = saleStatus({ salePrice: p.sale_price, starts: startsAt, ends: endsAt });
  const saleInfo: SaleInfo = {
    statusKind: status.kind,
    startsText: startsAt ? formatPkt(startsAt) : null,
    endsText: endsAt ? formatPkt(endsAt) : null,
    leftText: status.kind === "running" && status.msLeft !== null ? longDuration(status.msLeft) : null,
    timerOn: p.sale_timer,
    cost: showCost ? { avg: p.avg_cost == null ? null : Number(p.avg_cost), unknownUnits: Math.min(p.unvalued_units, p.stock), isOwner: admin.role === "owner" } : null,
  };
  const imgs = await db.query<{ url: string; alt: string }>("select url, alt from product_images where product_id = $1 and kind = 'photo' order by sort_order", [id]);
  const spin = await db.query<{ url: string }>("select url from product_images where product_id = $1 and kind = 'spin' order by sort_order", [id]);
  return (
    <div>
      <h1 className="mb-4 text-2xl font-extrabold">Edit product</h1>
      <Banner ok={sp.ok} error={sp.error} />
      <ProductForm
        categories={await listCategories()}
        uploads={cloudinaryConfig() !== null}
        saleInfo={saleInfo}
        policies={await listPolicies()}
        initialTab={sp.tab}
        v={{
          id: p.id, name: p.name, slug: p.slug, brand: p.brand ?? "", categoryId: p.category_id ?? "", description: p.description, price: p.price, salePrice: p.sale_price ?? "", saleStarts: instantToPktDate(p.sale_starts_at), saleEnds: instantToPktDate(p.sale_ends_at), saleTimer: p.sale_timer,
          sku: p.sku ?? "", stock: p.stock, status: p.archived ? "archived" : p.published ? "active" : "draft", seoTitle: p.seo_title ?? "", seoDescription: p.seo_description ?? "", warranty: p.warranty_info ?? "", weight: p.weight_grams ?? "",
          specs: Object.entries(p.specs ?? {}).map(([k, v]) => `${k}: ${v}`).join("\n"), devices: (p.compatible_devices ?? []).join(", "),
          images: imgs.map((i) => `${i.url}|${i.alt}`).join("\n"), spin: spin.map((s) => s.url).join("\n"),
          variantGroup: p.variant_group ?? "", variantLabel: p.variant_label ?? "", variantHex: p.variant_hex ?? "", variantRequired: p.variant_required, returnPolicyId: p.return_policy_id ?? "", warrantyPolicyId: p.warranty_policy_id ?? "",
        }}
      />
      {hasRole(admin, "owner") && (
        <div className="mt-10 max-w-3xl border-t border-line pb-28 pt-4 lg:pb-0">
          <p className="mb-2 text-sm text-muted">Deleting removes the product from the store. Past orders keep their records. Unpublishing (above) is usually safer.</p>
          <ConfirmButton action={deleteProductAction} fields={{ id: p.id }} title={`Delete “${p.name}”?`} description="This removes the product and its photos from the store. Past orders keep their own copy of what was bought. This cannot be undone." confirmLabel="Delete product" className="min-h-11 rounded-[var(--radius-sm)] bg-danger px-5 text-sm font-semibold text-white">Delete product</ConfirmButton>
        </div>
      )}
    </div>
  );
}
