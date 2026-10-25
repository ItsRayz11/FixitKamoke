import type { Metadata } from "next";
import Link from "next/link";
import { requireCustomer } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getProductsByIds } from "@/lib/catalog";
import { AccountNav } from "@/components/account/account-nav";
import { ProductCard } from "@/components/product/product-card";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Wishlist" };

export default async function WishlistPage() {
  const me = await requireCustomer();
  const ids = (await (await getDb()).query<{ product_id: string }>("select product_id from wishlist_items where customer_id = $1 order by created_at desc", [me.id])).map((r) => r.product_id);
  const products = await getProductsByIds(ids);
  return (
    <>
      <AccountNav name={me.name} current="/account/wishlist" />
      <h1 className="text-2xl font-extrabold">Your wishlist</h1>
      {products.length === 0 ? (
        <p className="mt-4 rounded-[var(--radius-md)] border border-dashed border-line bg-surface p-8 text-center text-muted">Nothing saved yet. Use “Save to wishlist” on a product page. <Link href="/shop" className="font-semibold text-accent underline">Browse products</Link></p>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">{products.map((p) => <li key={p.id}><ProductCard product={p} /></li>)}</ul>
      )}
    </>
  );
}
