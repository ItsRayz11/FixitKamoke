import Link from "next/link";
import { logoutAction } from "@/app/(shop)/account/actions";

const links = [["Orders", "/account"], ["Addresses", "/account/addresses"], ["Wishlist", "/account/wishlist"], ["Security", "/account/security"]] as const;

export function AccountNav({ name, current }: { name: string; current: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
      <div>
        <p className="text-sm text-muted">Signed in as</p>
        <p className="font-bold">{name}</p>
      </div>
      <nav aria-label="Account" className="flex flex-wrap items-center gap-4 text-sm">
        {links.map(([l, h]) => (
          <Link key={h} href={h} aria-current={current === h ? "page" : undefined} className={`min-h-11 py-3 font-semibold ${current === h ? "text-accent underline" : "hover:text-accent"}`}>{l}</Link>
        ))}
        <form action={logoutAction}><button className="min-h-11 font-semibold text-muted hover:text-danger">Sign out</button></form>
      </nav>
    </div>
  );
}
