/**
 * DRAFT policy text. It only describes what this website actually does. Commercial terms the owner has not decided
 * (return windows, warranty length, courier names, fees) are NOT written here: they come from the owner-editable
 * "Policy specifics" fields in Store settings, and show "to be confirmed" until filled in.
 */
export type PolicySlug = "shipping" | "returns" | "warranty" | "privacy" | "terms";

export interface Policy {
  slug: PolicySlug;
  title: string;
  description: string;
  /** Which owner-editable settings field supplies the specifics. */
  specifics?: "shippingTerms" | "returnsTerms" | "warrantyTerms";
  body: string;
}

export const POLICIES: Policy[] = [
  {
    slug: "shipping",
    title: "Shipping and delivery",
    description: "How Fixit delivers orders, how delivery fees are shown, and what happens if your city is not listed.",
    specifics: "shippingTerms",
    body: `
## How delivery fees work
Your delivery fee is shown at checkout, before you place your order, based on the city you enter. The fee in your order total is the fee you pay. We do not add delivery charges after you have seen your total.

## Cities we have not listed
If your city has no delivery fee set up yet, you can still send your order. Your total will say the delivery fee is **to be confirmed**. We will contact you with the fee, and your order is only confirmed once you have agreed to it. If we cannot deliver to your city we will tell you and cancel the order.

## Delivery times
Any delivery time shown is an estimate and not a guarantee. Delays can happen with couriers and weather.

## Payment on delivery
Where cash on delivery is available for your city it is offered at checkout. Otherwise you can choose bank transfer, and we will send you the account details to pay before we ship.

## Checking your parcel
Please check that your parcel and its contents look right when it arrives and contact us straight away if anything is wrong. See our [returns policy](/policies/returns).
`,
  },
  {
    slug: "returns",
    title: "Returns and refunds",
    description: "What to do if an item arrives damaged, faulty or not as ordered.",
    specifics: "returnsTerms",
    body: `
## If something is wrong with your order
Contact us as soon as you can through WhatsApp or our [contact page](/contact). Please include your order number and, if you can, clear photos of the item and the packaging. We look at every case and will tell you what we can do.

## Cancelling an order
You can ask us to cancel an order before it has shipped. Once an order is cancelled the items go back into stock.

## Refunds
If a refund is agreed, we will tell you how and when it will be paid back before anything is sent.

## Repairs
Repairs are handled separately. See [repairs](/repairs). The price of a repair is confirmed with you before work starts.
`,
  },
  {
    slug: "warranty",
    title: "Warranty",
    description: "How warranty information is shown for products and repairs.",
    specifics: "warrantyTerms",
    body: `
## Products
Warranty terms differ between products. When we have confirmed a warranty for a product it is shown on that product's page. If no warranty is shown, none is implied.

## Repairs
We confirm any warranty on a repair with you before the work starts. An estimate is not a final price and not a promise of a repair result.

## Claims
To make a claim, contact us with your order number or repair reference. Keep your packaging and proof of purchase where you can.
`,
  },
  {
    slug: "privacy",
    title: "Privacy",
    description: "What personal information Fixit collects, why, and how you can ask us to correct or delete it.",
    body: `
## What we collect
- **Orders:** your name, mobile number, delivery address, city, optional email and order notes, and what you ordered.
- **Repair requests:** your name, contact details, phone model and the problem you describe.
- **Contact messages:** what you type into the contact form.
- **Accounts (optional):** your name, email and a password stored in scrambled form. We never store your password in readable form.
- **Back-in-stock alert (optional):** if you ask to be told when a sold-out item returns, we keep your email address only to send that one message, and delete it within 30 days. It is never used for marketing.
- **Email updates (optional):** your email address and the time you agreed. You only receive marketing email if you tick the box for it.
- **Website use:** simple counts of events such as product views and orders, with no name, phone number, IP address or device details attached.

## Why we use it
To confirm and deliver your orders, handle your repair, answer your messages, keep your account working, and run the shop. Order and repair emails are sent because of what you asked us to do. Marketing emails are separate and only sent with your consent. You can unsubscribe at any time using the link in each email.

## Who sees it
Our staff who handle orders and repairs. Couriers receive your name, phone number and address so they can deliver. Our email provider sends the messages we ask it to send. We do not sell your personal information.

## Payments
We do not collect or store card details on this website.

## Cookies and local storage
Your cart is kept in your browser so it is still there when you return. Signing in to an account uses a session cookie. We do not use advertising cookies.

## Keeping and deleting your data
We keep order records for as long as we need them to run the business and answer questions about past orders. You can ask us to correct or delete your information, or delete your account from your account page, by contacting us through the [contact page](/contact).
`,
  },
  {
    slug: "terms",
    title: "Terms and conditions",
    description: "The terms for ordering from Fixit and using this website.",
    body: `
## Ordering
Prices are in Pakistani rupees (PKR). Placing an order is an offer to buy. We confirm each order, and an order is only accepted once we confirm it. We may cancel an order, for example if an item is out of stock or a price was shown wrongly, and we will tell you if we do.

## Prices and stock
We check stock and price when you place your order. If something changed we will tell you before the order is confirmed.

## Delivery and payment
See our [shipping policy](/policies/shipping). Cash on delivery or bank transfer is offered as shown at checkout.

## Returns, refunds and warranty
See our [returns policy](/policies/returns) and [warranty policy](/policies/warranty).

## Repairs
A repair request is not a booking. Estimates are not final prices. The price is confirmed with you before work starts.

## Using this website
Please do not misuse the site, try to access areas that are not meant for you, or submit false information.

## Changes
We may update these terms. The version on this page when you order applies to that order.

## Contact
Questions? See our [contact page](/contact).
`,
  },
];

export const getPolicy = (slug: string) => POLICIES.find((p) => p.slug === slug);
