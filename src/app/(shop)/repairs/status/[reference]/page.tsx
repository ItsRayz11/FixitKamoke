import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/db";
import { findRepairByToken } from "@/lib/repairs/repairs";
import { RepairDetails } from "@/components/repairs/repair-details";
import { getStore } from "@/lib/settings";
import { whatsappLink } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Repair request", robots: { index: false, follow: false } };

export default async function RepairStatusPage({ params, searchParams }: { params: Promise<{ reference: string }>; searchParams: Promise<{ t?: string }> }) {
  const [{ reference }, { t }] = await Promise.all([params, searchParams]);
  const repair = t ? await findRepairByToken(await getDb(), reference, t) : null;
  if (!repair) {
    return (
      <div className="container-x py-12 text-center">
        <h1 className="text-2xl font-extrabold">We could not open that request</h1>
        <p className="mt-2 text-muted">The link may be incomplete. You can look it up with its reference and your phone number.</p>
        <Link href="/repairs/track" className="mt-4 inline-block font-semibold text-accent">Check repair status</Link>
      </div>
    );
  }
  const wa = whatsappLink({ kind: "repair", reference: repair.reference }, (await getStore()).whatsappNumber);
  return (
    <div className="container-x max-w-2xl py-10">
      <h1 className="text-2xl font-extrabold">{repair.status === "new" ? "Your repair request is received" : "Your repair request"}</h1>
      <p className="mt-2 text-muted">Keep your reference <strong>{repair.reference}</strong>. We will contact you after reviewing it. This is not a booking, a quote or a promise of a repair result.</p>
      <div className="mt-6"><RepairDetails repair={repair} /></div>
      <div className="mt-6 flex flex-wrap gap-4 text-sm font-semibold">
        <Link href="/repairs/track" className="text-accent">Check status later</Link>
        {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="text-accent">Message us on WhatsApp</a>}
      </div>
    </div>
  );
}
