import { optimizeImageUrl } from "@/lib/domain/images";
import Link from "next/link";
import { collapseFinishes, listProducts, popularCategories } from "@/lib/catalog";
import { ProductCard } from "@/components/product/product-card";
import { getStore } from "@/lib/settings";
import { whatsappLink } from "@/lib/whatsapp";
import { RecentlyViewed } from "@/components/product/recently-viewed";
import { Spotlight } from "@/components/ui/spotlight";
import { Price } from "@/components/ui/price";
import { getDb } from "@/lib/db";
import { latestApprovedReviews } from "@/lib/reviews";
import { listPublishedPosts } from "@/lib/blog";
import { getShippingConfig } from "@/lib/orders/create-order";
import { formatPKR } from "@/lib/domain/money";

export const dynamic = "force-dynamic";

const STEPS = [
  ["Tell us the phone and the fault", "Send a repair request in a minute. No payment is taken."],
  ["We review and give an estimate", "We contact you with an estimate. It is not a final price until we confirm it."],
  ["You approve, then we repair", "Work only starts once you agree. Track progress with your reference."],
] as const;

export default async function HomePage() {
  const db = await getDb();
  const [categories, featuredRaw, reviews, guides, shipping, store] = await Promise.all([
    popularCategories(6),
    listProducts({ inStock: true, limit: 24 }),
    latestApprovedReviews(db, 3),
    listPublishedPosts(3),
    getShippingConfig(db),
    getStore(),
  ]);
  const featured = collapseFinishes(featuredRaw).slice(0, 8);
  const spot = featured.find((p) => p.image) ?? null;
  const wa = whatsappLink({ kind: "general" }, store.whatsappNumber);
  const zones = (shipping?.zones ?? []).slice(0, 4);

  return (
    <>
      {/* 2 + 3 + 4: value proposition, the two primary actions, and one focused visual */}
      <section className="grid-motif relative overflow-hidden bg-ink text-white">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-40 blur-3xl" style={{ background: "var(--holo)" }} />
        <div className="container-x relative grid gap-8 py-10 sm:py-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan">Kamoki, Punjab</p>
            <h1 className="mt-3 max-w-2xl text-[2rem] font-extrabold leading-[1.1] tracking-tight sm:text-5xl">
              {store.heroTitle ?? "Phone repairs and accessories you can order in minutes."}
            </h1>
            <p className="mt-4 max-w-xl text-[0.9375rem] leading-relaxed text-slate-300 sm:text-base">
              {store.heroSubtitle ?? "Browse chargers, cases and more with clear PKR prices, or book a repair and we will confirm the details with you before any work starts."}
            </p>
            <div className="mt-7 grid gap-3 sm:flex sm:flex-wrap">
              <Link href="/shop" className="btn btn-primary !min-h-12 sm:px-7">Shop accessories</Link>
              <Link href="/repairs" className="btn btn-glass !min-h-12 sm:px-7">Book a repair</Link>
              {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center px-2 text-sm font-semibold text-cyan underline">Ask on WhatsApp</a>}
            </div>
          </div>

          {spot && (
            <Spotlight className="mx-auto w-full max-w-sm rounded-[var(--radius-xl)] lg:max-w-none">
              <Link href={`/product/${spot.slug}`} className="holo-edge sweep sweep-play block overflow-hidden rounded-[var(--radius-xl)] text-text shadow-[var(--shadow-pop)]">
                <div className="stage aspect-[4/3] !rounded-none !border-0 !shadow-none sm:aspect-[16/10]">
                  {/* eslint-disable-next-line @next/next/no-img-element -- owner-supplied remote URL; size reserved by the aspect box */}
                  <img src={optimizeImageUrl(spot.image!.url, 800)} alt={spot.image!.alt} width={640} height={480} fetchPriority="high" decoding="async" className="h-full w-full object-contain p-3" />
                </div>
                <div className="flex items-center justify-between gap-3 bg-surface px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">Featured</p>
                    <p className="truncate font-bold">{spot.name}</p>
                  </div>
                  <Price price={spot.price} salePrice={spot.salePrice} />
                </div>
              </Link>
            </Spotlight>
          )}
        </div>
      </section>

      {/* 5: popular categories, ranked by real views and stock */}
      {categories.length > 0 && (
        <section className="reveal container-x py-9" aria-labelledby="cats">
          <h2 id="cats" className="text-xl font-bold">Shop by category</h2>
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {categories.map((c) => (
              <li key={c.id}>
                <Link href={`/category/${c.slug}`} className="ti-surface flex min-h-24 flex-col items-center justify-center rounded-[var(--radius-lg)] p-3 text-center transition-transform active:scale-[0.98]">
                  <span className="text-sm font-bold">{c.name}</span>
                  <span className="mt-0.5 text-xs text-slate-600">{c.inStock > 0 ? `${c.inStock} in stock` : "Currently sold out"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 6: featured products with exact prices */}
      <section className="container-x pb-9" aria-labelledby="featured">
        <div className="flex items-end justify-between">
          <h2 id="featured" className="text-xl font-bold">Available now</h2>
          <Link href="/shop" className="inline-flex min-h-11 items-center text-sm font-semibold text-accent">View all</Link>
        </div>
        {featured.length === 0 ? (
          <p className="mt-4 rounded-[var(--radius-md)] border border-dashed border-line bg-surface p-8 text-center text-muted">
            Products are being added. Please check back soon, or message us to ask about an item.
          </p>
        ) : (
          <ul className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {featured.map((p) => <li key={p.id}><ProductCard product={p} /></li>)}
          </ul>
        )}
      </section>

      <RecentlyViewed />

      {/* 7: repair services and the booking pathway */}
      <section className="reveal bg-surface py-10" aria-labelledby="repair">
        <div className="container-x">
          <h2 id="repair" className="text-xl font-bold">Repairs, confirmed before we start</h2>
          <p className="mt-2 max-w-2xl text-muted">Estimates are not final prices until we confirm them with you.</p>
          <ol className="mt-5 grid gap-3 md:grid-cols-3">
            {STEPS.map(([t, d], i) => (
              <li key={t} className="ti-surface rounded-[var(--radius-lg)] p-4">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-ink text-sm font-bold text-white" aria-hidden="true">{i + 1}</span>
                <p className="mt-2 font-bold">{t}</p>
                <p className="mt-1 text-sm text-slate-700">{d}</p>
              </li>
            ))}
          </ol>
          <Link href="/repairs" className="btn btn-primary mt-5 w-full sm:w-auto">Request a repair</Link>
        </div>
      </section>

      {/* 8: transparent delivery and support */}
      <section className="container-x py-10" aria-label="Delivery and support">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-[var(--radius-lg)] border border-line bg-surface p-5">
            <h2 className="text-xl font-bold">Delivery</h2>
            {zones.length > 0 ? (
              <ul className="mt-3 space-y-1 text-sm text-muted">
                {zones.map((z) => (
                  <li key={z.id}>
                    <strong className="text-text">{z.label}:</strong> {z.fee === 0 ? "free" : formatPKR(z.fee)}{z.etaDays ? `, ${z.etaDays[0]}–${z.etaDays[1]} days` : ""}{z.codAvailable ? ", cash on delivery" : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-muted">Delivery fees and times are shown at checkout before you place an order.</p>
            )}
            <p className="mt-3 text-sm text-muted">If we cannot confirm a rate for your city automatically, we tell you before the order is confirmed.</p>
          </div>
          <div className="rounded-[var(--radius-lg)] border border-line bg-surface p-5">
            <h2 className="text-xl font-bold">Support</h2>
            <ul className="mt-3 space-y-1 text-sm text-muted">
              {store.address && <li><strong className="text-text">Shop:</strong> {store.address}</li>}
              {store.openingHours && <li><strong className="text-text">Hours:</strong> {store.openingHours}</li>}
              <li>Track any order or repair with its reference number.</li>
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="btn btn-primary">WhatsApp us</a>}
              <Link href="/contact" className="btn btn-ti">Contact</Link>
              <Link href="/track" className="btn btn-ti">Track order</Link>
            </div>
          </div>
        </div>
      </section>

      {/* 9: real customer reviews, only when they exist */}
      {reviews.length > 0 && (
        <section className="container-x pb-10" aria-labelledby="reviews">
          <h2 id="reviews" className="text-xl font-bold">What customers say</h2>
          <ul className="mt-4 grid gap-3 md:grid-cols-3">
            {reviews.map((r) => (
              <li key={r.id} className="rounded-[var(--radius-lg)] border border-line bg-surface p-4 text-sm">
                <p aria-label={`${r.rating} out of 5 stars`}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</p>
                <p className="mt-1 line-clamp-4">{r.body}</p>
                <p className="mt-2 text-xs text-muted">{r.authorName} · verified purchase of <Link href={`/product/${r.productSlug}`} className="underline">{r.productName}</Link></p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 10: buying guides */}
      {guides.length > 0 && (
        <section className="container-x pb-10" aria-labelledby="guides">
          <div className="flex items-end justify-between">
            <h2 id="guides" className="text-xl font-bold">Buying guides</h2>
            <Link href="/blog" className="inline-flex min-h-11 items-center text-sm font-semibold text-accent">All guides</Link>
          </div>
          <ul className="mt-4 grid gap-3 md:grid-cols-3">
            {guides.map((g) => (
              <li key={g.id}>
                <Link href={`/blog/${g.slug}`} className="block h-full rounded-[var(--radius-lg)] border border-line bg-surface p-4 transition-colors hover:border-accent">
                  <span className="font-bold">{g.title}</span>
                  {g.excerpt && <span className="mt-1 line-clamp-3 block text-sm text-muted">{g.excerpt}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
