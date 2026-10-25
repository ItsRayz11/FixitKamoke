import type { Metadata } from "next";
import Link from "next/link";
import { getStore } from "@/lib/settings";
import { whatsappLink } from "@/lib/whatsapp";
import { RepairForm } from "@/components/repairs/repair-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Mobile phone repair",
  description: "Request a phone repair from Fixit in Kamoki. Tell us the model and the problem and we will review it and contact you with next steps.",
  alternates: { canonical: "/repairs" },
};

export default async function RepairsPage() {
  const store = await getStore();
  const wa = whatsappLink({ kind: "repair" }, store.whatsappNumber);
  return (
    <>
      <section className="grid-motif bg-ink text-white">
        <div className="container-x py-12">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Mobile phone repair</h1>
          <p className="mt-3 max-w-xl text-slate-300">Tell us your phone and what is wrong. We review every request, then contact you with an estimate or the next step. Nothing is booked or charged by sending this form.</p>
          {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex min-h-12 items-center rounded-[var(--radius-sm)] border border-white/25 px-5 font-semibold hover:bg-white/10">Ask on WhatsApp first</a>}
        </div>
      </section>

      <div className="container-x grid gap-10 py-10 lg:grid-cols-[1fr_340px]">
        <section aria-labelledby="req">
          <h2 id="req" className="text-xl font-bold">Request a repair</h2>
          <div className="mt-4 rounded-[var(--radius-md)] border border-line bg-surface p-5"><RepairForm services={store.repairServices} /></div>
          <p className="mt-4 text-sm"><Link href="/repairs/track" className="font-semibold text-accent underline">Already sent a request? Check its status</Link></p>
        </section>

        <aside className="space-y-6">
          {store.repairServices.length > 0 && (
            <section aria-labelledby="svc"><h2 id="svc" className="font-bold">Repairs we offer</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{store.repairServices.map((s) => <li key={s}>{s}</li>)}</ul></section>
          )}
          <section aria-labelledby="how"><h2 id="how" className="font-bold">How it works</h2>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted">
              <li>You send the request.</li>
              <li>We review it and contact you.</li>
              <li>We share an estimate. An estimate is not a final price.</li>
              <li>You decide whether to go ahead.</li>
              <li>We confirm the price before work starts.</li>
            </ol></section>
          <section aria-labelledby="visit"><h2 id="visit" className="font-bold">Visit the shop</h2>
            <p className="mt-2 text-sm text-muted">{store.address ?? "Shop address to be confirmed."}</p>
            {store.openingHours && <p className="text-sm text-muted">{store.openingHours}</p>}
          </section>
        </aside>
      </div>
    </>
  );
}
