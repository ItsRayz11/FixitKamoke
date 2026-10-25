# Deployment guide

**Status:** the app is deployable but has **not been deployed** by the developer (no hosting, database or domain accounts were available). Nothing here has been run against a live host. Follow the steps and tick the smoke tests.

## 0. Choose paid, production-suitable services
Do not run the live shop on Vercel Hobby (non-commercial) or on a database plan that pauses or has no backups. See DECISION_LOG §5. You need: an app host, a Postgres database with backups, a domain, and (for email) Resend.

## 1. Database
1. Create a Postgres database with automatic backups (for example Supabase Pro or Neon paid).
2. Copy its connection string into `DATABASE_URL`. On Supabase use the pooled "transaction" string for the app and the direct string for migrations if the pooler rejects multi-statement SQL.
3. Apply the schema from your computer or a CI job:
   ```
   DATABASE_URL="postgresql://…" npm run db:migrate
   ```
   It applies `db/migrations/*.sql` in order, once each, inside transactions. Take a backup before every future migration.
4. Supabase only: the migrations enable Row Level Security on every table and revoke API roles, so the public Supabase API cannot read your data. The app connects as the database owner with `DATABASE_URL`.

## 2. Environment variables
Set the variables in `.env.example` on the host (Production scope). Required: `DATABASE_URL`, `NEXT_PUBLIC_SITE_URL`, `ADMIN_SETUP_TOKEN`. Do **not** set `NEXT_PUBLIC_DEMO_MODE`, `FIXIT_PGLITE_DIR` or `RATE_LIMIT_MULTIPLIER`. Never commit `.env*` files (they are git-ignored).

## 3. Build and run
```
npm ci
npm run build
npm start        # or let the host run it
```
Node 20.19+ / 22 / 24. On Vercel, import the repository, set the environment variables, deploy. Add the cron below.

## 4. Domain and HTTPS
Buy the domain (availability of fixit.com / fixitkamoki.com is unverified), add it in the host, create the DNS records it shows, wait for the certificate, then confirm `https://` loads and `http://` redirects. Set `NEXT_PUBLIC_SITE_URL` to the final address and redeploy.

## 5. First owner account
Open `https://YOUR-DOMAIN/admin/setup`, enter `ADMIN_SETUP_TOKEN`, your name, email and a strong password. The page disappears once an owner exists. Then **remove `ADMIN_SETUP_TOKEN`** from the host. Create staff under Admin → Staff.

## 6. Configure the shop (Admin)
1. Store settings: WhatsApp number, address, hours, map links, socials, bank details, repair services, policy specifics. Tick "approved" only after you have read the policy pages.
2. Shipping: add delivery zones (nothing can be ordered until at least one exists).
3. Categories, then Products (photos by https URL), stock, coupons.
4. Blog → "Add starter guides", read and edit each, tick the review box to publish.
5. Open `/robots.txt` and `/sitemap.xml` and confirm they look right.

## 7. Email (Resend)
1. Create a Resend account, add and verify your domain (add the SPF/DKIM DNS records it gives you).
2. Set `RESEND_API_KEY` and `EMAIL_FROM` (an address on the verified domain). Redeploy.
3. Admin → Email status should say "Resend is configured". Place a test order with your own email and check it arrives.
4. Optional but recommended: set `CRON_SECRET` and schedule `GET /api/cron/email` every 5–10 minutes with header `Authorization: Bearer <CRON_SECRET>` (Vercel Cron, an uptime monitor, or GitHub Actions).
Free Resend plan: 100 emails/day, 3,000/month.

## 8. Search engines
Create a Google Search Console property for the domain, verify it (DNS), and submit `https://YOUR-DOMAIN/sitemap.xml`. Add the shop in Google Business Profile separately.

## 9. Smoke tests (do on the live site)
- [ ] Home, Shop, a product, Repairs, Contact load with no console errors.
- [ ] Place a real test order (cash on delivery, your own phone). It appears in Admin → Orders; stock dropped by the quantity.
- [ ] Confirm → Ship → Deliver it in admin; cancel a second test order and confirm stock returns.
- [ ] Track the order at `/track` with its number and phone.
- [ ] Submit a repair request; update it in Admin → Repairs; the status page shows the estimate wording.
- [ ] `/admin` redirects to sign-in when logged out. A staff account cannot open Products/Settings.
- [ ] `/api/dev/seed` returns 404. `/robots.txt` allows crawling and lists the sitemap.
- [ ] Test email received (if configured). The footer sign-up needs the consent tick.

## 10. Backups, monitoring, rollback
- Confirm the database backup schedule and do one **restore test** into a scratch database.
- Watch host logs for errors; each customer-facing error page shows a reference digest you can search for.
- Rollback: redeploy the previous successful build in the host. Migrations only add things, so older code keeps working; restore the backup only if data was damaged.
- Maintenance: set `MAINTENANCE_MODE=1` to show a "back soon" page while you work.

## 11. Updating
`git pull`, `npm ci`, `npm test`, `npm run build`, backup, `npm run db:migrate`, deploy.
