import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-4 text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-accent">Error 404</p>
      <h1 className="mt-2 text-3xl font-extrabold">We could not find that page</h1>
      <p className="mt-3 text-muted">The link may be old or mistyped. Try one of these instead.</p>
      <ul className="mt-6 flex flex-wrap justify-center gap-3 text-sm font-semibold">
        <li><Link className="inline-flex min-h-11 items-center rounded-[var(--radius-sm)] bg-accent px-5 text-white" href="/">Home</Link></li>
        <li><Link className="inline-flex min-h-11 items-center rounded-[var(--radius-sm)] border border-line px-5" href="/shop">Shop</Link></li>
        <li><Link className="inline-flex min-h-11 items-center rounded-[var(--radius-sm)] border border-line px-5" href="/repairs">Repairs</Link></li>
        <li><Link className="inline-flex min-h-11 items-center rounded-[var(--radius-sm)] border border-line px-5" href="/contact">Contact</Link></li>
      </ul>
    </div>
  );
}
