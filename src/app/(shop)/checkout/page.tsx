"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useCartView } from "@/components/cart/use-cart-view";
import { getAdvanceView, getCheckoutPrefill, previewCoupon, type CouponPreview, getPaymentChoices, getShippingView, placeOrder, type CheckoutPrefill, type ShippingView } from "@/app/actions/checkout";
import type { PaymentOptions } from "@/lib/payments";
import { formatPKR } from "@/lib/domain/money";
import { track } from "@/lib/track";
import { Steps } from "@/components/checkout/steps";
import { ONLINE_HINT, ONLINE_LABEL } from "@/lib/domain/gateways";
import { launchPayment, rememberToken } from "@/lib/pay-client";
import { startOnlinePayment } from "@/app/actions/pay";

const field = "mt-1 h-12 w-full rounded-[var(--radius-sm)] border border-line bg-surface px-3 text-base";

export default function CheckoutPage() {
  const router = useRouter();
  const { cart, view, loading } = useCartView();
  const [city, setCity] = useState("");
  const [ship, setShip] = useState<ShippingView | null>(null);
  const [payment, setPayment] = useState<string>("cod"); // "cod", "bank_transfer" or "online:<gateway>"
  const [methods, setMethods] = useState<PaymentOptions>({ cod: true, bankTransfer: true, online: [], wallets: [] });
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<{ message: string; fields?: Record<string, string> } | null>(null);
  const [pending, start] = useTransition();
  // One key per page visit: a double-click or network retry cannot create a second order.
  const idem = useRef<string>("");
  useEffect(() => {
    idem.current = crypto.randomUUID() + crypto.randomUUID();
    track("checkout_start");
    // Signed-in customers get their details filled in. Only fields that are still empty are touched,
    // so anything the customer has already typed is never overwritten.
    getPaymentChoices().then((m) => {
      setMethods(m);
      // Keep what the customer already chose; only switch if that method turned out to be unavailable.
      setPayment((cur) => (cur === "cod" && !m.cod ? "bank_transfer" : cur === "bank_transfer" && !m.bankTransfer ? "cod" : cur));
    }).catch(() => {});
    getCheckoutPrefill().then((p: CheckoutPrefill | null) => {
      if (!p) return;
      const fill = (id: string, value: string) => {
        const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null;
        if (el && value && !el.value) {
          // Set through the native setter so the browser form sees the value, and React stays in sync for controlled inputs.
          const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
          el.dispatchEvent(new Event("input", { bubbles: true }));
        }
      };
      fill("customerName", p.name); fill("phone", p.phone); fill("email", p.email); fill("city", p.city); fill("area", p.area); fill("address", p.address);
    }).catch(() => {});
  }, []);

  // The city field is uncontrolled, so text typed or autofilled before this page finished loading is kept;
  // this picks it up as soon as the field is attached.
  const cityRef = useCallback((el: HTMLInputElement | null) => { if (el?.value) setCity(el.value); }, []);

  const subtotal = view?.subtotal ?? 0;
  useEffect(() => {
    if (city.trim().length < 2) return;
    let cancelled = false;
    const t = setTimeout(() => { getShippingView(city, subtotal).then((s) => !cancelled && setShip(s)); }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [city, subtotal]);
  const shipNow = city.trim().length < 2 ? null : ship;
  const [couponText, setCouponText] = useState("");
  const [couponState, setCouponState] = useState<{ key: string; result: CouponPreview } | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);
  // A preview only counts while the cart, city and code are the same as when it was checked.
  const couponKey = JSON.stringify([cart.lines, city, couponText]);
  const coupon = couponState?.key === couponKey ? couponState.result : null;
  async function applyCoupon() {
    const key = couponKey;
    setCouponBusy(true);
    try { setCouponState({ key, result: await previewCoupon(couponText, cart.lines, city) }); } catch { setCouponState({ key, result: { ok: false, message: "Could not check the coupon. Please try again." } }); } finally { setCouponBusy(false); }
  }
  const saving = coupon?.ok ? coupon.discount : 0;
  const [adv, setAdv] = useState<{ advance: number; balance: number } | null>(null);
  const previewTotal = Math.max(0, subtotal + (shipNow?.status === "quoted" ? shipNow.fee : 0) - saving);
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => { getAdvanceView(previewTotal, city).then((a) => !cancelled && setAdv(a)).catch(() => !cancelled && setAdv(null)); }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [previewTotal, city]);
  const advanceNow = payment === "cod" && adv && adv.advance > 0 && previewTotal > 0 ? adv : null;

  const problems = view?.lines.some((l) => l.problem) || (view?.missing.length ?? 0) > 0;
  const fee = shipNow?.status === "quoted" ? shipNow.fee : 0;
  const codBlocked = shipNow?.status === "quoted" && !shipNow.codAvailable;
  const blocked = shipNow?.status === "not_serviceable" || shipNow?.status === "unconfigured";
  const onlineOk = shipNow?.status === "quoted"; // the amount charged must be final, so online payment waits for a confirmed delivery fee
  const onlineBlocked = payment.startsWith("online:") && !onlineOk;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? "").trim() || undefined;
    setError(null);
    start(async () => {
      const r = await placeOrder({
        idempotencyKey: idem.current,
        customerName: s("customerName"), phone: s("phone"), email: s("email"), city: s("city"), area: s("area"),
        address: s("address"), notes: s("notes"), paymentMethod: payment.startsWith("online:") ? "online" : payment, paymentProvider: payment.startsWith("online:") ? payment.slice(7) : undefined, couponCode: couponText.trim() || undefined,
        items: cart.lines,
      });
      if (r.ok) {
        cart.clear();
        rememberToken(r.orderNumber, r.token);
        const orderUrl = `/order/${r.orderNumber}?t=${encodeURIComponent(r.token)}`;
        if (payment.startsWith("online:")) {
          // The order exists and is waiting for payment; hand the customer to the payment provider.
          const started = await startOnlinePayment(r.orderNumber, r.token);
          const problem = launchPayment(started);
          if (problem) router.push(`${orderUrl}&pay=failed`);
          return;
        }
        router.push(orderUrl);
      } else {
        setError({ message: r.message, fields: r.fieldErrors });
        track("checkout_error");
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  }

  if (cart.ready && cart.lines.length === 0) {
    return (
      <div className="container-x py-10"><title>Checkout | Fixit</title>
        <p className="rounded-[var(--radius-md)] border border-dashed border-line bg-surface p-10 text-center">Your cart is empty. <Link href="/shop" className="font-semibold text-accent">Browse products</Link></p>
      </div>
    );
  }

  const fe = error?.fields ?? {};
  const err = (k: string) => fe[k] && <p className="mt-1 text-sm text-danger" role="alert">{fe[k]}</p>;

  return (
    <div className="container-x has-purchase-bar py-6 sm:py-8 lg:pb-8">
      <title>Checkout | Fixit</title>
      <h1 className="text-2xl font-extrabold">Checkout</h1>
      <Steps current={2} />
      {error && <p role="alert" className="mt-4 rounded-[var(--radius-sm)] bg-red-50 p-3 text-sm font-semibold text-danger">{error.message}</p>}

      <form onSubmit={onSubmit} className="group/form mt-6 grid gap-8 lg:grid-cols-[1fr_360px]" noValidate>
        <div className="space-y-4">
          <div><label htmlFor="customerName" className="font-semibold">Full name</label><input id="customerName" name="customerName" autoComplete="name" required className={field} />{err("customerName")}</div>
          <div><label htmlFor="phone" className="font-semibold">Mobile number</label><input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="03XX XXXXXXX" required className={field} />{err("phone")}</div>
          <div><label htmlFor="email" className="font-semibold">Email <span className="font-normal text-muted">(optional, for order updates)</span></label><input id="email" name="email" type="email" autoComplete="email" className={field} />{err("email")}</div>
          <div><label htmlFor="city" className="font-semibold">City</label><input id="city" name="city" ref={cityRef} autoComplete="address-level2" required defaultValue="" onInput={(e) => setCity(e.currentTarget.value)} className={field} />{err("city")}</div>
          <div><label htmlFor="area" className="font-semibold">Area / locality <span className="font-normal text-muted">(optional)</span></label><input id="area" name="area" className={field} /></div>
          <div><label htmlFor="address" className="font-semibold">Complete delivery address</label><textarea id="address" name="address" required rows={3} autoComplete="street-address" className={`${field} h-auto py-2`} />{err("address")}</div>
          <div><label htmlFor="notes" className="font-semibold">Order notes <span className="font-normal text-muted">(optional)</span></label><textarea id="notes" name="notes" rows={2} className={`${field} h-auto py-2`} /></div>
          <div><label htmlFor="couponCode" className="font-semibold">Coupon code <span className="font-normal text-muted">(optional)</span></label>
            <div className="flex gap-2"><input id="couponCode" name="couponCode" value={couponText} onChange={(e) => setCouponText(e.target.value)} className={`${field} min-w-0 flex-1`} autoCapitalize="characters" />
              <button type="button" onClick={applyCoupon} disabled={couponBusy || couponText.trim().length < 3 || !cart.lines.length} className="btn btn-ti mt-1 !min-h-12 shrink-0">{couponBusy ? "Checking…" : "Apply"}</button></div>
            {coupon && (coupon.ok ? <p role="status" className="mt-1 text-sm font-semibold text-ok">{coupon.code} applied: you save {formatPKR(coupon.discount)}.</p> : <p role="alert" className="mt-1 text-sm text-danger">{coupon.message}</p>)}</div>

          <fieldset>
            <legend className="font-semibold">Payment method</legend>
            {methods.cod && <label className="mt-2 flex min-h-11 items-center gap-3"><input type="radio" name="pay" checked={payment === "cod"} onChange={() => setPayment("cod")} className="h-5 w-5" /> <span className="min-w-0">Cash on delivery{adv && adv.advance > 0 && <span className="block text-xs text-muted">Part is paid in advance, the rest on delivery</span>}</span></label>}
            {methods.bankTransfer && <label className="flex min-h-11 items-center gap-3"><input type="radio" name="pay" checked={payment === "bank_transfer"} onChange={() => setPayment("bank_transfer")} className="h-5 w-5" /> Bank transfer <span className="text-xs text-muted">(we will message you the account details)</span></label>}
            {methods.online.map((g) => (
              <label key={g} className={`flex min-h-11 items-center gap-3 ${onlineOk ? "" : "opacity-60"}`}>
                <input type="radio" name="pay" disabled={!onlineOk} checked={payment === `online:${g}`} onChange={() => setPayment(`online:${g}`)} className="h-5 w-5" /> {ONLINE_LABEL[g] ?? g}
              </label>
            ))}
            {methods.online.length > 0 && <p className="text-xs text-muted">{onlineOk ? ONLINE_HINT : "Online payment becomes available once your city is entered and the delivery fee is confirmed."}</p>}
            {methods.wallets.map((w) => <label key={w} className="flex min-h-11 items-center gap-3"><input type="radio" name="pay" checked={payment === w} onChange={() => setPayment(w)} className="h-5 w-5" /> {w === "jazzcash_manual" ? "JazzCash transfer" : "Easypaisa transfer"} <span className="text-xs text-muted">(details shown after you order)</span></label>)}
            {!methods.cod && !methods.bankTransfer && methods.wallets.length === 0 && methods.online.length === 0 && <p role="alert" className="text-sm text-danger">No payment method is available right now. Please contact us.</p>}
            {codBlocked && payment === "cod" && <p role="alert" className="text-sm text-danger">Cash on delivery is not available for this city. Please choose bank transfer.</p>}
          </fieldset>

          <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-5 w-5" required />
            <span>I have read the <Link className="underline" href="/policies/shipping" target="_blank">shipping</Link>, <Link className="underline" href="/policies/returns" target="_blank">returns</Link> and <Link className="underline" href="/policies/terms" target="_blank">terms</Link>.</span></label>
        </div>

        <aside className="h-fit rounded-[var(--radius-lg)] border border-line bg-surface p-5 shadow-[var(--shadow-card)] lg:sticky lg:top-24" aria-label="Order summary">
          <h2 className="font-bold">Order summary</h2>
          {loading && <div className="mt-3 h-16 animate-pulse rounded bg-line" aria-busy="true" />}
          <ul className="mt-3 space-y-2 text-sm">
            {view?.lines.map((l) => <li key={l.productId} className="flex justify-between gap-2"><span>{l.quantity} × {l.name}{l.problem && <span className="block font-semibold text-danger">{l.problem}</span>}</span><span>{formatPKR(l.lineTotal)}</span></li>)}
          </ul>
          <dl className="mt-4 space-y-1 border-t border-line pt-3 text-sm">
            {(view?.saleSavings ?? 0) > 0 && <div className="flex justify-between"><dt>Items at regular price</dt><dd data-testid="regular-total">{formatPKR(view!.regularTotal)}</dd></div>}
            {(view?.saleSavings ?? 0) > 0 && <div className="flex justify-between text-ok"><dt>Sale savings</dt><dd data-testid="sale-savings">−{formatPKR(view!.saleSavings)}</dd></div>}
            <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatPKR(subtotal)}</dd></div>
            <div className="flex justify-between"><dt>Delivery</dt><dd data-testid="ship-fee">
              {!shipNow ? "Enter your city" : shipNow.status === "quoted" ? (fee === 0 ? "Free" : formatPKR(fee)) : shipNow.status === "needs_confirmation" ? "To be confirmed" : "Unavailable"}
            </dd></div>
            {saving > 0 && <div className="flex justify-between text-ok"><dt>Coupon savings</dt><dd data-testid="coupon-saving">−{formatPKR(saving)}</dd></div>}
            <div className="flex justify-between border-t border-line pt-2 text-base font-bold"><dt>Total</dt><dd data-testid="order-total">{formatPKR(Math.max(0, subtotal + fee - saving))}</dd></div>
          </dl>
          {advanceNow && (
            <div className="mt-3 rounded-[var(--radius-sm)] border border-line bg-canvas p-3 text-sm" data-testid="advance-box">
              <p className="font-semibold">Cash on delivery with advance</p>
              <dl className="mt-1 space-y-1">
                <div className="flex justify-between gap-3"><dt>Pay now (advance)</dt><dd className="font-bold" data-testid="advance-now">{formatPKR(advanceNow.advance)}</dd></div>
                <div className="flex justify-between gap-3"><dt>Pay on delivery</dt><dd className="font-bold" data-testid="advance-later">{formatPKR(advanceNow.balance)}</dd></div>
              </dl>
              <p className="mt-2 text-xs text-muted">After you place the order we show how to send the advance. We confirm the order once it has arrived. The exact amounts are shown on your order page.</p>
            </div>
          )}
          {shipNow?.status === "needs_confirmation" && <p className="mt-3 text-sm text-warn">We could not calculate delivery for this city automatically. We will contact you to confirm the delivery fee before your order is confirmed.</p>}
          {shipNow?.status === "not_serviceable" && <p role="alert" className="mt-3 text-sm text-danger">We do not deliver to this city yet.</p>}
          {shipNow?.status === "unconfigured" && <p role="alert" className="mt-3 text-sm text-danger">Delivery is not set up yet, so orders cannot be placed.</p>}
          {shipNow?.status === "quoted" && shipNow.etaDays && <p className="mt-3 text-sm text-muted">Estimated delivery: {shipNow.etaDays[0]}–{shipNow.etaDays[1]} days.</p>}
          <p className="mt-2 text-xs text-muted">Final prices and stock are confirmed by the server when you place the order.</p>
          <div className="purchase-bar group-has-[input:not([type=checkbox]):not([type=radio]):focus,textarea:focus,select:focus]/form:hidden lg:static lg:mt-4 lg:p-0 lg:!block">
            <div className="glass-panel mx-auto flex max-w-xl items-center gap-3 rounded-[var(--radius-lg)] p-2.5 pl-4 lg:block lg:!border-0 lg:!bg-transparent lg:!p-0 lg:!shadow-none lg:![backdrop-filter:none]">
              <p className="min-w-0 flex-1 leading-tight lg:hidden"><span className="block text-xs text-muted">Total to pay</span><span className="text-base font-extrabold">{formatPKR(Math.max(0, subtotal + fee - saving))}{shipNow?.status === "needs_confirmation" ? "+" : ""}</span></p>
              <button type="submit" disabled={pending || !agree || !!problems || blocked || onlineBlocked || !!(codBlocked && payment === "cod") || !view?.lines.length}
                className="btn btn-primary !min-h-12 min-w-36 lg:w-full">
                {pending ? (payment.startsWith("online:") ? "Taking you to payment…" : "Placing order…") : payment.startsWith("online:") ? "Place order and pay" : "Place order"}
              </button>
            </div>
          </div>
          {!agree && <p className="mt-2 text-xs text-muted">Tick the box above to confirm you have read our policies.</p>}
        </aside>
      </form>
    </div>
  );
}
