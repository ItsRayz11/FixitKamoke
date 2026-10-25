import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { POLICIES, getPolicy } from "@/content/policies";
import { renderMarkdown } from "@/lib/markdown";
import { getStore } from "@/lib/settings";
import { getDb } from "@/lib/db";
import { getShippingConfig } from "@/lib/orders/create-order";
import { formatPKR } from "@/lib/domain/money";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return POLICIES.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = getPolicy((await params).slug);
  return p ? { title: p.title, description: p.description, alternates: { canonical: `/policies/${p.slug}` } } : { title: "Not found" };
}

export default async function PolicyPage({ params }: { params: Promise<{ slug: string }> }) {
  const policy = getPolicy((await params).slug);
  if (!policy) notFound();
  const store = await getStore();
  const specifics = policy.specifics ? store[policy.specifics] : null;
  const shipping = policy.slug === "shipping" ? await getShippingConfig(await getDb()) : null;

  return (
    <div className="container-x max-w-3xl py-10">
      <h1 className="text-3xl font-extrabold tracking-tight">{policy.title}</h1>
      {!store.policiesApproved && (
        <p role="note" className="mt-4 rounded-[var(--radius-sm)] border border-amber-300 bg-amber-50 p-3 text-sm text-warn">
          Draft: this page is waiting for the shop owner’s approval and may change.
        </p>
      )}
      <div className="mt-2">{renderMarkdown(policy.body)}</div>

      {policy.slug === "shipping" && (
        <section aria-labelledby="zones" className="mt-8">
          <h2 id="zones" className="text-xl font-bold">Current delivery fees</h2>
          {!shipping || shipping.zones.length === 0 ? (
            <p className="mt-3 text-muted">Delivery fees are being set up and will be listed here.</p>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-[var(--radius-md)] border border-line bg-surface">
              <table className="w-full text-sm">
                <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted"><tr><th className="px-3 py-2">Area</th><th className="px-3 py-2">Cities</th><th className="px-3 py-2">Fee</th><th className="px-3 py-2">Cash on delivery</th><th className="px-3 py-2">Estimated time</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {shipping.zones.map((z) => (
                    <tr key={z.id} className="align-top">
                      <td className="px-3 py-2 font-semibold">{z.label}</td>
                      <td className="px-3 py-2">{z.cities.join(", ")}</td>
                      <td className="px-3 py-2">{z.fee === 0 ? "Free" : formatPKR(z.fee)}{z.freeThreshold ? `, free from ${formatPKR(z.freeThreshold)}` : ""}</td>
                      <td className="px-3 py-2">{z.codAvailable ? "Available" : "Not available"}</td>
                      <td className="px-3 py-2">{z.etaDays ? `${z.etaDays[0]}–${z.etaDays[1]} days` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {policy.specifics && (
        <section aria-labelledby="specific" className="mt-8">
          <h2 id="specific" className="text-xl font-bold">Specific terms</h2>
          {specifics ? renderMarkdown(specifics) : <p className="mt-3 text-muted">These terms are to be confirmed by Fixit. Please contact us if you need them before ordering.</p>}
        </section>
      )}

      <nav aria-label="Other policies" className="mt-10 border-t border-line pt-4 text-sm">
        <ul className="flex flex-wrap gap-x-5 gap-y-1">
          {POLICIES.filter((p) => p.slug !== policy.slug).map((p) => <li key={p.slug}><Link href={`/policies/${p.slug}`} className="font-semibold text-accent">{p.title}</Link></li>)}
        </ul>
      </nav>
    </div>
  );
}
