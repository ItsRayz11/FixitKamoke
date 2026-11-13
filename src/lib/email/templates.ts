import { paymentLabel } from "@/lib/domain/payment-label";
import { formatPKR } from "@/lib/domain/money";

export interface EmailContext {
  baseUrl: string;
  whatsappNumber: string | null;
  contactEmail: string | null;
}

export interface Rendered { subject: string; html: string; text: string }

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function shell(ctx: EmailContext, title: string, bodyHtml: string): string {
  const help = ctx.whatsappNumber
    ? `Questions? Message us on <a href="https://wa.me/${escapeHtml(ctx.whatsappNumber)}" style="color:#1d5bff">WhatsApp</a>.`
    : ctx.contactEmail ? `Questions? Email <a href="mailto:${escapeHtml(ctx.contactEmail)}" style="color:#1d5bff">${escapeHtml(ctx.contactEmail)}</a>.` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;background:#f4f6fa;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden">
<tr><td style="background:#0b1220;color:#ffffff;padding:16px 24px;font-size:20px;font-weight:700">Fix<span style="color:#22d3ee">it</span></td></tr>
<tr><td style="padding:24px;font-size:16px;line-height:1.5">${bodyHtml}
<p style="margin-top:24px;font-size:14px;color:#475569">${help}</p></td></tr>
</table></td></tr></table></body></html>`;
}

const p = (s: string) => `<p style="margin:0 0 12px">${s}</p>`;
const btn = (href: string, label: string) => `<p style="margin:16px 0"><a href="${escapeHtml(href)}" style="background:#1d5bff;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block;font-weight:700">${escapeHtml(label)}</a></p>`;

export interface OrderEmailData {
  orderNumber: string;
  customerName: string;
  status: string;
  paymentMethod: string;
  paymentProvider?: string | null;
  subtotal: number;
  discount: number;
  shippingFee: number;
  shippingStatus: string;
  total: number;
  /** Cash-on-delivery advance. 0 when none applies. */
  advanceRequired?: number;
  advancePaid?: number;
  carrier?: string | null;
  trackingNumber?: string | null;
  refundedAmount?: number;
  paymentStatus?: string;
  items: { name: string; quantity: number; lineTotal: number }[];
}

const orderTable = (d: OrderEmailData) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px;border-top:1px solid #dde3ee">
${d.items.map((i) => `<tr><td style="padding:8px 0;border-bottom:1px solid #dde3ee">${i.quantity} × ${escapeHtml(i.name)}</td><td align="right" style="padding:8px 0;border-bottom:1px solid #dde3ee">${formatPKR(i.lineTotal)}</td></tr>`).join("")}
<tr><td style="padding:8px 0">Delivery</td><td align="right">${d.shippingStatus === "needs_confirmation" ? "To be confirmed" : d.shippingFee === 0 ? "Free" : formatPKR(d.shippingFee)}</td></tr>
${d.discount > 0 ? `<tr><td style="padding:4px 0">Discount</td><td align="right">−${formatPKR(d.discount)}</td></tr>` : ""}
<tr><td style="padding:8px 0;font-weight:700">Total</td><td align="right" style="font-weight:700">${formatPKR(d.total)}</td></tr></table>`;

const orderText = (d: OrderEmailData) =>
  [...d.items.map((i) => `${i.quantity} x ${i.name}  ${formatPKR(i.lineTotal)}`),
    `Delivery: ${d.shippingStatus === "needs_confirmation" ? "to be confirmed" : d.shippingFee === 0 ? "Free" : formatPKR(d.shippingFee)}`,
    ...(d.discount > 0 ? [`Discount: -${formatPKR(d.discount)}`] : []), `Total: ${formatPKR(d.total)}`].join("\n");

export function renderOrderEmail(kind: string, d: OrderEmailData, ctx: EmailContext): Rendered | null {
  const track = `${ctx.baseUrl}/track`;
  const first = escapeHtml(d.customerName.split(" ")[0] ?? d.customerName);
  const pay = paymentLabel(d.paymentMethod, d.paymentProvider);
  const adv = d.paymentMethod === "cod" && (d.advancePaid ?? 0) === 0 ? (d.advanceRequired ?? 0) : 0;
  const paidAdv = d.paymentMethod === "cod" ? (d.advancePaid ?? 0) : 0;
  // A transfer, wallet or online order that is not paid yet: say what is owed and that nothing is confirmed until the money is checked.
  const waiting = d.paymentMethod !== "cod" && d.paymentStatus !== "paid";
  const waitingPlain = `Waiting for your payment of ${formatPKR(d.total)} (${pay}). The payment details are on the order page you saw after ordering. We confirm the order only after we have checked that the money arrived.`;
  const waitingHtml = `<strong>Waiting for your payment of ${formatPKR(d.total)}</strong> (${escapeHtml(pay)}). The payment details are on the order page you saw after ordering. We confirm the order only after we have checked that the money arrived.`;
  const lines: Record<string, { subject: string; intro: string; plain: string }> = {
    order_payment_confirmed: {
      subject: `We received your payment for order ${d.orderNumber}`,
      intro: `Thank you, ${first}. We have checked and received your payment of <strong>${formatPKR(d.total)}</strong> for order <strong>${escapeHtml(d.orderNumber)}</strong>. We will contact you to confirm the order.`,
      plain: `We have checked and received your payment of ${formatPKR(d.total)} for order ${d.orderNumber}. We will contact you to confirm the order.`,
    },
    order_advance_verified: {
      subject: `We received your advance for order ${d.orderNumber}`,
      intro: `Thank you, ${first}. We have checked and received your advance of <strong>${formatPKR(paidAdv)}</strong> for order <strong>${escapeHtml(d.orderNumber)}</strong>. Remaining to pay on delivery: <strong>${formatPKR(d.total - paidAdv)}</strong>. We will contact you to confirm the order.`,
      plain: `We have checked and received your advance of ${formatPKR(paidAdv)} for order ${d.orderNumber}. Remaining to pay on delivery: ${formatPKR(d.total - paidAdv)}. We will contact you to confirm the order.`,
    },
    order_received: {
      subject: `We received your order ${d.orderNumber}`,
      intro: `Thank you, ${first}. We have received your order <strong>${escapeHtml(d.orderNumber)}</strong>. It is not confirmed yet: we will contact you to confirm it${d.shippingStatus === "needs_confirmation" ? " and your delivery fee" : ""}.${adv ? ` <strong>An advance of ${formatPKR(adv)} must be paid first</strong>; the remaining ${formatPKR(d.total - adv)} is paid on delivery. The payment details are on your order page.` : ""}${waiting ? ` ${waitingHtml}` : ""}`,
      plain: `Thank you. We have received your order ${d.orderNumber}. It is not confirmed yet: we will contact you to confirm it${d.shippingStatus === "needs_confirmation" ? " and your delivery fee" : ""}.${adv ? ` An advance of ${formatPKR(adv)} must be paid first; the remaining ${formatPKR(d.total - adv)} is paid on delivery. The payment details are on your order page.` : ""}${waiting ? ` ${waitingPlain}` : ""}`,
    },
    order_confirmed: {
      subject: `Your order ${d.orderNumber} is confirmed`,
      intro: `Good news, ${first}: order <strong>${escapeHtml(d.orderNumber)}</strong> is confirmed. Payment: ${pay}.${paidAdv > 0 ? ` Advance received: ${formatPKR(paidAdv)}. To pay on delivery: ${formatPKR(d.total - paidAdv)}.` : ""}`,
      plain: `Your order ${d.orderNumber} is confirmed. Payment: ${pay}.${paidAdv > 0 ? ` Advance received: ${formatPKR(paidAdv)}. To pay on delivery: ${formatPKR(d.total - paidAdv)}.` : ""}`,
    },
    order_shipped: {
      subject: `Your order ${d.orderNumber} has been sent`,
      intro: `Order <strong>${escapeHtml(d.orderNumber)}</strong> is on its way, ${first}.${d.carrier ? ` Courier: ${escapeHtml(d.carrier)}${d.trackingNumber ? `, tracking number: <strong>${escapeHtml(d.trackingNumber)}</strong>` : ""}.` : ""}${d.paymentMethod === "cod" ? ` Please keep ${formatPKR(d.total - (d.advancePaid ?? 0))} ready to pay on delivery.` : ""}`,
      plain: `Your order ${d.orderNumber} is on its way.${d.carrier ? ` Courier: ${d.carrier}${d.trackingNumber ? `, tracking number: ${d.trackingNumber}` : ""}.` : ""}${d.paymentMethod === "cod" ? ` Please keep ${formatPKR(d.total - (d.advancePaid ?? 0))} ready to pay on delivery.` : ""}`,
    },
    order_tracking_updated: {
      subject: `Courier details for order ${d.orderNumber}`,
      intro: `Your order <strong>${escapeHtml(d.orderNumber)}</strong> is with the courier${d.carrier ? `: <strong>${escapeHtml(d.carrier)}</strong>${d.trackingNumber ? `, tracking number <strong>${escapeHtml(d.trackingNumber)}</strong>` : ""}` : ""}.`,
      plain: `Your order ${d.orderNumber} is with the courier${d.carrier ? `: ${d.carrier}${d.trackingNumber ? `, tracking number ${d.trackingNumber}` : ""}` : ""}.`,
    },
    order_out_for_delivery: {
      subject: `Your order ${d.orderNumber} is out for delivery`,
      intro: `Order <strong>${escapeHtml(d.orderNumber)}</strong> is out for delivery today, ${first}.${d.paymentMethod === "cod" ? ` Please keep ${formatPKR(d.total - (d.advancePaid ?? 0))} ready to pay.` : ""}`,
      plain: `Your order ${d.orderNumber} is out for delivery.${d.paymentMethod === "cod" ? ` Please keep ${formatPKR(d.total - (d.advancePaid ?? 0))} ready to pay.` : ""}`,
    },
    order_refunded: {
      subject: `A refund was recorded for order ${d.orderNumber}`,
      intro: `A refund of <strong>${formatPKR(d.refundedAmount ?? 0)}</strong> has been recorded for order <strong>${escapeHtml(d.orderNumber)}</strong>. It was returned through the same way you paid. Your bank or wallet decides how long it takes to show; contact us if it has not arrived.`,
      plain: `A refund of ${formatPKR(d.refundedAmount ?? 0)} has been recorded for order ${d.orderNumber}. It was returned through the same way you paid. Your bank or wallet decides how long it takes to show; contact us if it has not arrived.`,
    },
    order_delivered: {
      subject: `Your order ${d.orderNumber} was delivered`,
      intro: `Order <strong>${escapeHtml(d.orderNumber)}</strong> is marked as delivered. If anything is wrong, please contact us straight away.`,
      plain: `Your order ${d.orderNumber} is marked as delivered. If anything is wrong, please contact us straight away.`,
    },
    order_cancelled: {
      subject: `Your order ${d.orderNumber} was cancelled`,
      intro: `Order <strong>${escapeHtml(d.orderNumber)}</strong> has been cancelled. If you did not expect this, please contact us.`,
      plain: `Your order ${d.orderNumber} has been cancelled. If you did not expect this, please contact us.`,
    },
  };
  const l = lines[kind];
  if (!l) return null;
  const html = shell(ctx, l.subject, p(l.intro) + orderTable(d) + btn(track, "Track your order") + p(`<span style="font-size:14px;color:#475569">Use your order number and the mobile number you gave us.</span>`));
  return { subject: l.subject, html, text: `${l.plain}\n\n${orderText(d)}\n\nTrack your order: ${track}` };
}

export interface RepairEmailData { reference: string; customerName: string; status: string; label: string; estimateAmount: number | null; estimateIsConfirmed: boolean; customerMessage: string | null }

export function renderRepairEmail(kind: string, d: RepairEmailData, ctx: EmailContext): Rendered | null {
  const track = `${ctx.baseUrl}/repairs/track`;
  const first = escapeHtml(d.customerName.split(" ")[0] ?? d.customerName);
  if (kind === "repair_received") {
    const subject = `We received your repair request ${d.reference}`;
    const html = shell(ctx, subject, p(`Thank you, ${first}. We have received repair request <strong>${escapeHtml(d.reference)}</strong>.`) +
      p("This is not a booking, a quote or a promise of a repair result. We will review it and contact you.") + btn(track, "Check repair status"));
    return { subject, html, text: `We have received repair request ${d.reference}. This is not a booking, a quote or a promise of a repair result. We will review it and contact you.\n\nCheck status: ${track}` };
  }
  if (kind === "repair_status") {
    const subject = `Update on repair request ${d.reference}: ${d.label}`;
    const price = d.estimateAmount === null ? "" : d.estimateIsConfirmed
      ? p(`Confirmed price: <strong>${formatPKR(d.estimateAmount)}</strong>.`)
      : p(`Estimate (not a final price): <strong>${formatPKR(d.estimateAmount)}</strong>. We will confirm the price with you before any work starts.`);
    const msg = d.customerMessage ? p(`<em>${escapeHtml(d.customerMessage)}</em>`) : "";
    const html = shell(ctx, subject, p(`Hello ${first}, your repair request <strong>${escapeHtml(d.reference)}</strong> is now: <strong>${escapeHtml(d.label)}</strong>.`) + price + msg + btn(track, "See details"));
    const priceText = d.estimateAmount === null ? "" : d.estimateIsConfirmed ? `\nConfirmed price: ${formatPKR(d.estimateAmount)}` : `\nEstimate (not a final price): ${formatPKR(d.estimateAmount)}`;
    return { subject, html, text: `Your repair request ${d.reference} is now: ${d.label}.${priceText}${d.customerMessage ? `\n${d.customerMessage}` : ""}\n\nSee details: ${track}` };
  }
  return null;
}

export function renderBackInStock(d: { name: string; slug: string; stock: number }, ctx: EmailContext): Rendered {
  const link = `${ctx.baseUrl}/product/${d.slug}`;
  const subject = `${d.name} is back in stock`;
  const html = shell(ctx, subject, p(`Good news: <strong>${escapeHtml(d.name)}</strong> is back in stock.`) +
    p(`<span style="font-size:14px;color:#475569">Stock is limited and can sell out again, so we cannot promise it will still be here when you open this. You asked us for this one email; we will not send another about this item.</span>`) +
    btn(link, "View the product"));
  return { subject, html, text: `${d.name} is back in stock.

Stock is limited and can sell out again. You asked us for this one email; we will not send another about this item.

View the product: ${link}` };
}

export function renderPasswordReset(token: string, ctx: EmailContext): Rendered {
  const link = `${ctx.baseUrl}/account/reset?token=${encodeURIComponent(token)}`;
  const subject = "Reset your Fixit password";
  const html = shell(ctx, subject, p("We received a request to reset the password on your Fixit account.") + btn(link, "Choose a new password") +
    p(`<span style="font-size:14px;color:#475569">This link works once and expires in 1 hour. If you did not ask for this, you can ignore this email and your password will stay the same.</span>`));
  return { subject, html, text: `We received a request to reset your Fixit password.

Choose a new password (link works once, expires in 1 hour): ${link}

If you did not ask for this, ignore this email.` };
}

export function renderStaffAlert(kind: string, ref: string, summary: string, ctx: EmailContext): Rendered {
  const label = kind === "order" ? "New order" : kind === "repair" ? "New repair request" : kind === "stock" ? "Low stock" : "New message";
  const path = kind === "order" ? "/admin/orders" : kind === "repair" ? "/admin/repairs" : kind === "stock" ? "/admin/inventory?low=1" : "/admin/messages";
  const subject = `${label} ${ref}`;
  const link = `${ctx.baseUrl}${path}`;
  const html = shell(ctx, subject, p(`<strong>${escapeHtml(label)}</strong> ${escapeHtml(ref)}`) + p(escapeHtml(summary)) + btn(link, "Open in admin"));
  return { subject, html, text: `${label} ${ref}
${summary}

Open in admin: ${link}` };
}

export function renderContactReceived(name: string, ctx: EmailContext): Rendered {
  const first = escapeHtml(name.split(" ")[0] ?? name);
  const subject = "We received your message";
  const html = shell(ctx, subject, p(`Thank you, ${first}. We have received your message and will reply as soon as we can.`) +
    p(`<span style="font-size:14px;color:#475569">This is an automatic acknowledgement, not an answer to your question. Please do not reply to it.</span>`));
  return { subject, html, text: "Thank you. We have received your message and will reply as soon as we can.\n\nThis is an automatic acknowledgement, not an answer to your question." };
}
