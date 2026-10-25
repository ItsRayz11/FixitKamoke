import type { Metadata } from "next";
import { getStore } from "@/lib/settings";
import { whatsappLink } from "@/lib/whatsapp";
import { ContactForm } from "@/components/contact/contact-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Contact us", description: "Contact Fixit by WhatsApp, message form or visit the shop in Kamoki.", alternates: { canonical: "/contact" } };

/** Only genuine Google Maps embed URLs are allowed into an iframe. */
function safeEmbed(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === "www.google.com" || u.hostname === "maps.google.com") && u.pathname.startsWith("/maps") ? u.toString() : null;
  } catch { return null; }
}

export default async function ContactPage() {
  const store = await getStore();
  const wa = whatsappLink({ kind: "general" }, store.whatsappNumber);
  const waLoc = whatsappLink({ kind: "location" }, store.whatsappNumber);
  const embed = safeEmbed(store.mapsEmbedUrl);
  return (
    <div className="container-x py-10">
      <h1 className="text-3xl font-extrabold tracking-tight">Contact us</h1>
      <div className="mt-8 grid gap-10 lg:grid-cols-2">
        <section aria-labelledby="msg">
          <h2 id="msg" className="text-xl font-bold">Send a message</h2>
          <div className="mt-4 rounded-[var(--radius-md)] border border-line bg-surface p-5"><ContactForm /></div>
        </section>
        <section aria-labelledby="find" className="space-y-5">
          <h2 id="find" className="text-xl font-bold">Find us</h2>
          <dl className="space-y-3 text-sm">
            <div><dt className="font-semibold">Shop address</dt><dd className="text-muted">{store.address ?? "To be confirmed."}</dd></div>
            <div><dt className="font-semibold">Opening hours</dt><dd className="text-muted">{store.openingHours ?? "To be confirmed."}</dd></div>
            {store.contactEmail && <div><dt className="font-semibold">Email</dt><dd><a className="text-accent underline" href={`mailto:${store.contactEmail}`}>{store.contactEmail}</a></dd></div>}
          </dl>
          <div className="flex flex-wrap gap-3">
            {wa ? <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center rounded-[var(--radius-sm)] bg-accent px-5 font-semibold text-white hover:bg-accent-strong">Chat on WhatsApp</a>
              : <p className="text-sm text-muted">WhatsApp number to be confirmed.</p>}
            {waLoc && <a href={waLoc} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center rounded-[var(--radius-sm)] border border-line px-5 font-semibold hover:border-accent">Ask about location and hours</a>}
            {store.mapsUrl && <a href={store.mapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center rounded-[var(--radius-sm)] border border-line px-5 font-semibold hover:border-accent">Get directions</a>}
          </div>
          {embed ? (
            <iframe title="Fixit shop location on Google Maps" src={embed} loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="aspect-[4/3] w-full rounded-[var(--radius-md)] border border-line" />
          ) : (
            <p className="rounded-[var(--radius-md)] border border-dashed border-line bg-surface p-6 text-center text-sm text-muted">The map will appear here once the shop location is confirmed.</p>
          )}
        </section>
      </div>
    </div>
  );
}
