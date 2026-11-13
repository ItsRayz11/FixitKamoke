import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { leavesNoPaymentMethod, type PaymentOptions } from "@/lib/payments";
import { Price } from "@/components/ui/price";

const opts = (o: Partial<PaymentOptions> = {}): PaymentOptions => ({ cod: false, bankTransfer: false, online: [], wallets: [], ...o });

describe("never lock the shop", () => {
  it("refuses to turn off the last remaining method", () => {
    expect(leavesNoPaymentMethod(opts({ cod: true }), "cod")).toBe(true);
    expect(leavesNoPaymentMethod(opts({ bankTransfer: true }), "bank")).toBe(true);
    expect(leavesNoPaymentMethod(opts({ wallets: ["jazzcash_manual"] }), "jazzcash")).toBe(true);
  });
  it("allows it while another method stays on", () => {
    expect(leavesNoPaymentMethod(opts({ cod: true, bankTransfer: true }), "cod")).toBe(false);
    expect(leavesNoPaymentMethod(opts({ cod: true, wallets: ["easypaisa_manual"] }), "cod")).toBe(false);
    expect(leavesNoPaymentMethod(opts({ wallets: ["jazzcash_manual", "easypaisa_manual"] }), "jazzcash")).toBe(false);
    expect(leavesNoPaymentMethod(opts({ cod: true, online: ["safepay"] }), "cod")).toBe(false);
  });
});

describe("Price never hides a discount that is being charged", () => {
  it("shows the regular price struck through even when the saving rounds below 1%", () => {
    const html = renderToStaticMarkup(<Price price={10000} salePrice={9999} />);
    expect(html).toContain("Rs. 9,999");
    expect(html).toContain("line-through");
    expect(html).not.toContain("percent-off"); // no misleading "0% off" badge
  });
  it("shows the badge for a real discount and nothing for no sale", () => {
    expect(renderToStaticMarkup(<Price price={3000} salePrice={2700} />)).toContain("−10%");
    const plain = renderToStaticMarkup(<Price price={3000} salePrice={null} />);
    expect(plain).toContain("Rs. 3,000");
    expect(plain).not.toContain("line-through");
  });
});
