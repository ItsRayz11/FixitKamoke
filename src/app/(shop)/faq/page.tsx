import type { Metadata } from "next";
import Link from "next/link";
import { renderInline } from "@/lib/markdown";

export const metadata: Metadata = { title: "Frequently asked questions", description: "Answers about ordering, delivery, payment and repairs at Fixit.", alternates: { canonical: "/faq" } };

const FAQ: { q: string; a: string }[] = [
  { q: "Do I need an account to order?", a: "No. You can check out as a guest. An account is optional and lets you see your past orders." },
  { q: "How much is delivery?", a: "Your delivery fee is shown at checkout once you enter your city. See [shipping and delivery](/policies/shipping) for the current fees. If your city is not set up yet, the fee shows as to be confirmed and we agree it with you before your order is confirmed." },
  { q: "How can I pay?", a: "Cash on delivery where it is available for your city, or bank transfer. Online card payments are not offered at the moment. We never ask for card details on this website." },
  { q: "Is my order confirmed as soon as I place it?", a: "No. Placing an order sends it to us. We contact you to confirm it, and you can follow its progress on the [tracking page](/track)." },
  { q: "How do I track my order?", a: "Use the link on your confirmation page, or enter your order number and the mobile number you used on the [tracking page](/track)." },
  { q: "What if an item is out of stock?", a: "Out-of-stock items cannot be added to the cart. If stock runs out while you are checking out, we tell you before the order is placed." },
  { q: "How do repairs work?", a: "Send a [repair request](/repairs) with your phone model and the problem. We review it and contact you with an estimate or next step. An estimate is not a final price, and nothing is booked until you agree." },
  { q: "Can you promise how long a repair will take or that it will work?", a: "We do not promise times or results before looking at the phone. We tell you what we can do once we have reviewed your request." },
  { q: "What if my item arrives damaged or wrong?", a: "Contact us straight away with your order number and photos. See our [returns policy](/policies/returns)." },
  { q: "How do I contact you?", a: "Use WhatsApp or the [contact page](/contact)." },
];

export default function FaqPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") } })),
  };
  return (
    <div className="container-x max-w-3xl py-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <h1 className="text-3xl font-extrabold tracking-tight">Frequently asked questions</h1>
      <div className="mt-6 divide-y divide-line rounded-[var(--radius-md)] border border-line bg-surface">
        {FAQ.map((f) => (
          <details key={f.q} className="group px-4">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 font-semibold">
              {f.q}<span aria-hidden className="text-xl text-accent transition-transform group-open:rotate-45 motion-reduce:transition-none">+</span>
            </summary>
            <p className="pb-4 text-muted">{renderInline(f.a, f.q)}</p>
          </details>
        ))}
      </div>
      <p className="mt-6 text-sm text-muted">Still stuck? <Link href="/contact" className="font-semibold text-accent underline">Contact us</Link>.</p>
    </div>
  );
}
