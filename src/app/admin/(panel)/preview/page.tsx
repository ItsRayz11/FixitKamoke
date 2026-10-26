import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { PhonePreview } from "@/components/admin/phone-preview";

export const dynamic = "force-dynamic";

export default async function Preview() {
  await requireAdmin("staff");
  const db = await getDb();
  const finish = await db.query<{ slug: string; name: string }>("select slug, name from products where published and variant_group is not null order by created_at limit 1");
  const first = await db.query<{ slug: string; name: string }>("select slug, name from products where published and variant_group is null order by created_at desc limit 1");
  const pages = [
    { path: "/", label: "Homepage" },
    { path: "/shop", label: "Shop listing" },
    ...(first[0] ? [{ path: `/product/${first[0].slug}`, label: `Product: ${first[0].name}` }] : []),
    ...(finish[0] ? [{ path: `/product/${finish[0].slug}`, label: `Product with finishes: ${finish[0].name}` }] : []),
    { path: "/cart", label: "Cart" },
    { path: "/checkout", label: "Checkout" },
    { path: "/repairs", label: "Repair booking" },
    { path: "/track", label: "Order tracking" },
  ];
  return (
    <div>
      <h1 className="text-2xl font-extrabold">Phone preview</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">See the storefront inside a phone-shaped frame at common widths. The frame scrolls independently, shows the status bar and bottom safe area, and the purchase bar and drawers behave as they do on a phone.</p>
      <div className="mt-4"><PhonePreview pages={pages} /></div>
    </div>
  );
}
