import { requireAdmin } from "@/lib/auth/session";
import { listCategories } from "@/lib/catalog";
import { ProductForm, emptyProduct } from "@/components/admin/product-form";

export const dynamic = "force-dynamic";

export default async function NewProduct() {
  await requireAdmin("manager");
  return (
    <div>
      <h1 className="mb-4 text-2xl font-extrabold">Add product</h1>
      <ProductForm v={emptyProduct} categories={await listCategories()} />
    </div>
  );
}
