import { requireAdmin, hasRole } from "@/lib/auth/session";
import { getAttentionCounts } from "@/lib/admin/stats";
import { AdminShell, type NavItem } from "@/components/admin/admin-shell";
import { RowLabels } from "@/components/admin/row-labels";
import { logoutAction } from "../actions";

const NAV: (NavItem & { min: "staff" | "manager" | "owner" })[] = [
  { href: "/admin", label: "Dashboard", group: "Overview", min: "staff" },
  { href: "/admin/analytics", label: "Funnel", group: "Overview", min: "manager" },
  { href: "/admin/preview", label: "Phone preview", group: "Overview", min: "staff" },
  { href: "/admin/orders", label: "Orders", group: "Sales", min: "staff" },
  { href: "/admin/repairs", label: "Repairs", group: "Sales", min: "staff" },
  { href: "/admin/messages", label: "Messages", group: "Sales", min: "staff" },
  { href: "/admin/customers", label: "Customers", group: "Sales", min: "manager" },
  { href: "/admin/products", label: "Products", group: "Catalogue", min: "manager" },
  { href: "/admin/categories", label: "Categories", group: "Catalogue", min: "manager" },
  { href: "/admin/inventory", label: "Inventory", group: "Catalogue", min: "manager" },
  { href: "/admin/coupons", label: "Coupons", group: "Catalogue", min: "manager" },
  { href: "/admin/reviews", label: "Reviews", group: "Catalogue", min: "manager" },
  { href: "/admin/shipping", label: "Shipping", group: "Catalogue", min: "manager" },
  { href: "/admin/blog", label: "Blog", group: "Content", min: "manager" },
  { href: "/admin/subscribers", label: "Email list", group: "Content", min: "manager" },
  { href: "/admin/security", label: "Account security", group: "Account", min: "staff" },
  { href: "/admin/settings", label: "Store settings", group: "Settings", min: "owner" },
  { href: "/admin/payments", label: "Payments", group: "Settings", min: "owner" },
  { href: "/admin/email", label: "Email status", group: "Settings", min: "owner" },
  { href: "/admin/users", label: "Staff", group: "Settings", min: "owner" },
  { href: "/admin/audit", label: "Audit log", group: "Settings", min: "owner" },
];

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin("staff");
  const counts = await getAttentionCounts();
  const badge: Record<string, number> = { "/admin/orders": counts.orders, "/admin/repairs": counts.repairs, "/admin/messages": counts.messages };
  const items: NavItem[] = NAV.filter((n) => hasRole(admin, n.min)).map((n) => ({ href: n.href, label: n.label, group: n.group, badge: badge[n.href] }));
  return (
    <AdminShell
      items={items}
      userLabel={`${admin.displayName ?? admin.email} · ${admin.role}`}
      signOut={<form action={logoutAction}><button className="text-sm">Sign out</button></form>}
    >
      <RowLabels />
      {children}
    </AdminShell>
  );
}
