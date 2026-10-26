# Go-live guide: free start on Neon, payments, photos, turntable, real phones

Written for the shop owner. Do the steps in order. Nothing here costs money until you choose to upgrade.

## 1. Database: start free on Neon

**Recommendation: Neon free, not Supabase free.**

| | Neon free | Supabase free |
|---|---|---|
| Sleeps when idle | Compute pauses after ~5 minutes and wakes on the next visit (about a second slower for that first visitor). Data is safe. | The **whole project pauses after about a week without activity** and must be restored by hand. A shop with no customers yet will hit this. |
| Storage | 0.5 to 1 GB per project (Neon's pages disagree, check the plan page) | 500 MB |
| Backups | "Instant restore" history of about 6 hours on the free plan | None you can rely on |
| Fit for this app | Plain Postgres, works with this app's driver as is | Also works, but the pausing is a real risk |

This shop stores text and links, not photos (Cloudinary holds those), so 0.5 GB lasts a very long time.

**Plan for the free tier honestly:**
- A free database with a 6-hour restore window is **not a backup**. Once you have real orders, either move to Neon's paid Launch plan (about the price of a lunch per month at small size) or take a weekly copy yourself (see "Weekly copy" below).
- Upgrade the day you have customers you cannot afford to lose.

Sources: [Neon pricing](https://neon.com/pricing), [Neon free plan FAQ](https://neon.com/faqs/postgres-services-free-to-production). Limits change, so confirm on the page before relying on a number.

### Steps
1. Create an account at neon.com and a project (pick the region nearest your customers; Singapore or Mumbai if offered).
2. In the project, open **Connect**, choose the **Pooled connection** and copy the connection string. It looks like `postgresql://user:password@ep-xxxx-pooler.region.aws.neon.tech/neondb?sslmode=require`.
3. On your own computer, in the project folder, run (PowerShell):
   `$env:DATABASE_URL="<paste the string>"; npm run db:migrate`
   You should see each migration listed as "applied" and finally "migrations up to date". This creates every table. It is safe to run again later: only new migrations are applied.
4. Put the same string in your host as the `DATABASE_URL` setting (step 2 below).
5. Never put this string in the code, in a chat, or in a screenshot. It is a password to all your customers' data.

### Weekly copy (free-tier safety net)
Install PostgreSQL's command-line tools, then once a week run:
`pg_dump "<your DATABASE_URL>" -Fc -f fixit-backup-YYYY-MM-DD.dump`
Keep the file somewhere other than this computer (Google Drive is fine; the file contains customer names, phones and addresses, so keep that folder private).

## 2. Hosting

Vercel's free "Hobby" plan is for non-commercial use only, so a live shop needs a paid host (Vercel Pro, or Railway/Render/a VPS). Set these settings on the host (names are exact):

| Setting | What it is | Needed |
|---|---|---|
| `DATABASE_URL` | Neon pooled connection string | **yes** |
| `SITE_URL` | Your real address, e.g. `https://www.yourshop.pk`, no trailing slash | **yes** |
| `ADMIN_SETUP_TOKEN` | 16+ random characters, used once to create the owner login, then delete it | first day only |
| `TWO_FACTOR_KEY` | 32+ random characters; turns on two-step sign-in for staff | recommended |
| `RESEND_API_KEY`, `EMAIL_FROM` | Order and alert emails | recommended |
| `CRON_SECRET` | Lets a scheduler send queued emails | optional |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Photo upload | recommended |
| Gateway settings (section 4) | Online payments | optional |

Then open `/admin/setup`, create the owner, delete `ADMIN_SETUP_TOKEN`, open **Admin → Account security** and turn on two-step sign-in, and fill in **Admin → Store settings** (WhatsApp, address, hours, social links, bank and wallet details, contact email).

**Domain:** it is set by `SITE_URL` on the host, not inside the admin (a wrong domain would break every link in emails and payments). Admin → Store settings shows what the shop currently believes its address is and warns while it is still a test address.

## 3. Photos with Cloudinary

1. Create a free Cloudinary account. On the dashboard note the **cloud name**, **API key** and **API secret**.
2. Set the three `CLOUDINARY_*` settings on the host and redeploy.
3. In **Admin → Products → (a product)** you now get **Upload photos from this device**. Photos go straight from your phone or computer to Cloudinary; the shop stores the link.
4. The shop automatically asks Cloudinary for a right-sized, modern-format copy (`f_auto,q_auto`), so pages stay fast on cheap phones.
5. Free-plan limits are generous for a small shop (credits per month); check your Cloudinary dashboard occasionally.

Follow [PRODUCT_PHOTOGRAPHY_GUIDE.md](PRODUCT_PHOTOGRAPHY_GUIDE.md): the same angles, light and background for every product.

## 4. Online payments: what is detected automatically?

| Way to pay | Detected automatically? | What you need |
|---|---|---|
| Cash on delivery | n/a (paid at the door) | nothing |
| Bank transfer, or a **personal** JazzCash/Easypaisa wallet | **No.** The shop gets no signal. The customer sends the transaction ID on their order page; staff check the banking app and press "paid" | nothing |
| **Safepay** merchant account | **Yes**, by a signed message to the shop | Safepay merchant account |
| **JazzCash Merchant** account (not a personal wallet) | **Yes**, by a signed result posted to the shop | JazzCash merchant account (Merchant ID, Password, Integrity Salt) |
| **Easypaisa Merchant** account | Yes in principle, **but not built**: Easypaisa gives its notification format only to merchants | Easypaisa merchant account and its Merchant Integration Guide |

How automatic detection is kept safe: an order is marked paid **only** when the provider's message arrives with a valid signature, our own payment reference and the exact amount. The customer's browser can never mark an order paid. Forged, altered, wrong-amount and repeated messages are refused and listed in Admin → Payments.

### Turning a gateway on (about 30 minutes, once you have the merchant account)
1. Set the gateway's settings on the host (`JAZZCASH_MERCHANT_ID`, `JAZZCASH_PASSWORD`, `JAZZCASH_INTEGRITY_SALT`, optional `JAZZCASH_ENV=production`; or `SAFEPAY_API_KEY`, `SAFEPAY_SECRET_KEY`, `SAFEPAY_WEBHOOK_SECRET`, optional `SAFEPAY_ENV=production`). Start with the provider's **sandbox** credentials.
2. Admin → Payments shows the exact address to give the provider ("callback" / "webhook" address). Enter it in the provider's merchant dashboard.
3. In Admin → Payments press **Start testing (staff only)**. Only signed-in staff see the option at checkout.
4. Signed in as staff, add a cheap item to the cart, choose the gateway at checkout and pay with the provider's test details.
5. When the provider's message arrives, Admin → Payments lists it as "valid" and "paid", and **Go live for customers** unlocks. Press it. Cancel the test order.
6. Switch to production credentials only when the provider has approved your live account, and make **one small real payment** yourself to confirm.

If something fails, the "What the providers have sent us" table says why (for example "signature does not match": the Integrity Salt or webhook secret is wrong).

**Honest limits:** these two adapters were written from the providers' public documentation and checked with signed test messages, but they have **not** been run against a live merchant account from here. Providers sometimes differ by account version, and Safepay's checkout address and message layout can need a small adjustment (settings `SAFEPAY_API_BASE`, `SAFEPAY_CHECKOUT_BASE`, `SAFEPAY_AMOUNT_UNIT=paisa`). The staff test above is what proves it, and the gateway cannot reach customers until it passes.

## 5. The 360° turntable

You do **not** need a 3D model, and the shop never uses AI-made pictures of a product: a customer must see the real item.

**What to shoot (real photos, same product you sell):**
- A cheap motorised or manual **turntable** (a lazy-Susan works for a manual one), plain light background, soft light from both sides.
- Phone on a tripod, **never moved**. Product centred, filling most of the frame.
- **24 frames** is a good start (one every 15°), 36 for a smoother turn. Turn the same amount each time.
- Same exposure for every frame (lock focus and exposure). Square crop, at least 1200 × 1200 px.
- Name the files `01.jpg`, `02.jpg` … `24.jpg` in turning order.

ChatGPT or any assistant can help you plan the shoot or write the shot list, but it must not generate the pictures themselves.

**Adding it:** Admin → Products → (the product or finish) → **360° turntable view** → **Upload turntable frames** → select all files at once. The shop sorts them by number. Press Save. Each finish has its own set. Customers get a **360° view** button that they drag, swipe or use the arrow keys on.

## 6. Real-phone checks (you do these, with a pencil and 30 minutes)

Use the live address (or `npm run dev -- -H 0.0.0.0` and your computer's address on the same Wi-Fi). Test on **one iPhone (Safari)** and **one Android (Chrome)**, ideally one cheap/old one. Tick each:

**Browsing**
- [ ] Home loads in a few seconds on mobile data, no sideways scrolling, text readable without zooming
- [ ] Menu button opens the side menu; Search opens and the keyboard does not hide the search box
- [ ] Product photos swipe; pinch-zoom still works on the page
- [ ] 360° view turns when you drag sideways, and the page still scrolls when you swipe up/down

**Buying**
- [ ] Choose a finish: the photo, price and stock change together
- [ ] Add to cart: the confirmation appears above the bottom bar; "Continue shopping" and "Open cart" both work
- [ ] The bottom bar never covers a form field; it hides when you type
- [ ] Checkout: number keypad appears for the phone field; autofill of name/address works
- [ ] "Place order" reachable with the keyboard open (iPhone: the bottom bar and the home bar do not overlap)
- [ ] Order confirmation shows; the transaction-ID box works for bank transfer

**Admin on your phone**
- [ ] Bottom tabs and the "More" menu work; the Orders list reads as cards
- [ ] You can confirm an order, mark it paid, and adjust stock
- [ ] Two-step sign-in: code from the authenticator app signs you in

**Feel**
- [ ] Nothing jumps while loading; buttons are easy to tap with a thumb
- [ ] With the phone's "Reduce motion" setting on (Accessibility), the page has no animation
- [ ] Turn on VoiceOver (iPhone) or TalkBack (Android) once: you can reach the menu, a product, "Add to cart" and checkout

Write down anything odd (screenshot + page + phone model) and send it over.
