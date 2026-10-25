import Link from "next/link";
import { requireAdmin, hasRole } from "@/lib/auth/session";
import { logoutAction } from "../actions";

const NAV: { href: string; label: string; min: "staff" | "manager" | "owner" }[] = [
  { href: "/admin", label: "Dashboard", min: "staff" },
  { href: "/admin/orders", label: "Orders", min: "staff" },
  { href: "/admin/repairs", label: "Repairs", min: "staff" },
  { href: "/admin/products", label: "Products", min: "manager" },
  { href: "/admin/categories", label: "Categories", min: "manager" },
  { href: "/admin/inventory", label: "Inventory", min: "manager" },
  { href: "/admin/coupons", label: "Coupons", min: "manager" },
  { href: "/admin/blog", label: "Blog", min: "manager" },
  { href: "/admin/reviews", label: "Reviews", min: "manager" },
  { href: "/admin/customers", label: "Customers", min: "manager" },
  { href: "/admin/shipping", label: "Shipping", min: "manager" },
  { href: "/admin/settings", label: "Store settings", min: "owner" },
  { href: "/admin/email", label: "Email status", min: "owner" },
  { href: "/admin/users", label: "Staff", min: "owner" },
  { href: "/admin/audit", label: "Audit log", min: "owner" },
];

export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin("staff");
  return (
    <div className="min-h-screen bg-canvas">
      <div className="border-b border-white/10 bg-ink text-white">
        <div className="container-x flex h-14 items-center justify-between gap-3">
          <Link href="/admin" className="font-extrabold">Fix<span className="text-cyan">it</span> <span className="text-xs font-medium text-slate-300">admin</span></Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-slate-300 sm:inline">{admin.displayName ?? admin.email} · {admin.role}</span>
            <Link href="/" className="hover:text-cyan">View store</Link>
            <form action={logoutAction}><button className="min-h-11 font-semibold hover:text-cyan">Sign out</button></form>
          </div>
        </div>
        <nav aria-label="Admin" className="container-x flex gap-4 overflow-x-auto pb-2 text-sm">
          {NAV.filter((n) => hasRole(admin, n.min)).map((n) => (
            <Link key={n.href} href={n.href} className="whitespace-nowrap py-1 text-slate-200 hover:text-cyan">{n.label}</Link>
          ))}
        </nav>
      </div>
      <div className="container-x py-6">{children}</div>
    </div>
  );
}
