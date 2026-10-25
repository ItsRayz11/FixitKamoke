import { site } from "@/config/site";

export type WhatsAppContext =
  | { kind: "general" }
  | { kind: "product"; name: string; url?: string }
  | { kind: "availability"; name: string }
  | { kind: "cart"; itemCount: number }
  | { kind: "order"; orderNumber: string }
  | { kind: "repair"; reference?: string }
  | { kind: "location" };

export function whatsappMessage(ctx: WhatsAppContext): string {
  switch (ctx.kind) {
    case "general":
      return "Hello Fixit, I have a question.";
    case "product":
      return `Hello Fixit, I have a question about: ${ctx.name}${ctx.url ? `\n${ctx.url}` : ""}`;
    case "availability":
      return `Hello Fixit, is "${ctx.name}" available?`;
    case "cart":
      return `Hello Fixit, I need help with my cart (${ctx.itemCount} item${ctx.itemCount === 1 ? "" : "s"}).`;
    case "order":
      return `Hello Fixit, I need help with order ${ctx.orderNumber}.`;
    case "repair":
      return ctx.reference
        ? `Hello Fixit, I would like an update on repair request ${ctx.reference}.`
        : "Hello Fixit, I would like to ask about a phone repair.";
    case "location":
      return "Hello Fixit, where is your shop and what are your opening hours?";
  }
}

/** Returns a click-to-chat link, or null when the owner has not configured a number. Nothing is sent automatically. */
export function whatsappLink(ctx: WhatsAppContext): string | null {
  if (!site.whatsappNumber) return null;
  return `https://wa.me/${site.whatsappNumber}?text=${encodeURIComponent(whatsappMessage(ctx))}`;
}
