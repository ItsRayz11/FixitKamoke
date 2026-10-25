import Link from "next/link";
import { site } from "@/config/site";

const links = [
  ["Shipping & delivery", "/policies/shipping"],
  ["Returns & refunds", "/policies/returns"],
  ["Warranty", "/policies/warranty"],
  ["Privacy", "/policies/privacy"],
  ["Terms", "/policies/terms"],
  ["FAQ", "/faq"],
] as const;

export function SiteFooter() {
  const socials = Object.entries(site.social).filter(([, v]) => v) as [string, string][];
  return (
    <footer className="mt-16 bg-ink text-slate-300">
      <div className="container-x grid gap-8 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-xl font-extrabold text-white">Fix<span className="text-cyan">it</span></p>
          <p className="mt-2 text-sm">{site.tagline}.</p>
        </div>
        <nav aria-label="Shop">
          <p className="text-sm font-semibold text-white">Shop</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link href="/shop" className="hover:text-white">All products</Link></li>
            <li><Link href="/repairs" className="hover:text-white">Book a repair</Link></li>
            <li><Link href="/track" className="hover:text-white">Track an order</Link></li>
            <li><Link href="/blog" className="hover:text-white">Buying guides</Link></li>
          </ul>
        </nav>
        <nav aria-label="Policies">
          <p className="text-sm font-semibold text-white">Help</p>
          <ul className="mt-3 space-y-2 text-sm">
            {links.map(([l, h]) => <li key={h}><Link href={h} className="hover:text-white">{l}</Link></li>)}
            <li><Link href="/about" className="hover:text-white">About Fixit</Link></li>
            <li><Link href="/contact" className="hover:text-white">Contact</Link></li>
          </ul>
        </nav>
        <div className="text-sm">
          <p className="font-semibold text-white">Visit</p>
          <p className="mt-3">{site.address ?? "Shop address to be confirmed."}</p>
          {site.openingHours && <p className="mt-1">{site.openingHours}</p>}
          {socials.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-3">
              {socials.map(([n, u]) => (
                <li key={n}><a href={u} target="_blank" rel="noopener noreferrer" className="capitalize underline hover:text-white">{n}</a></li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="border-t border-white/10 py-4 text-center text-xs">© {new Date().getFullYear()} Fixit. All rights reserved.</div>
    </footer>
  );
}
