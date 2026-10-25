import { requireAdmin } from "@/lib/auth/session";
import { getStore } from "@/lib/settings";
import { KeepForm } from "@/components/admin/keep-form";
import { Banner, Field, inputCls, Submit } from "@/components/admin/ui";
import { saveStoreAction } from "../settings-actions";

export const dynamic = "force-dynamic";

export default async function SettingsAdmin({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireAdmin("owner");
  const sp = await searchParams;
  const s = await getStore();
  const t = (id: keyof typeof s, label: string, hint?: string, type = "text") => (
    <Field label={label} id={id} hint={hint}><input id={id} name={id} type={type} defaultValue={(s[id] as string | null) ?? ""} className={inputCls} /></Field>
  );
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-extrabold">Store settings</h1>
      <p className="mt-1 text-sm text-muted">Leave a field empty if it is not confirmed yet. The storefront shows “to be confirmed” instead of guessing.</p>
      <div className="mt-4"><Banner ok={sp.ok} error={sp.error} /></div>
      <KeepForm action={saveStoreAction} className="space-y-8">
        <fieldset className="space-y-4"><legend className="text-lg font-bold">Contact and location</legend>
          {t("whatsappNumber", "WhatsApp number", "Digits with country code, e.g. 923001234567.")}
          {t("address", "Shop address")}
          {t("openingHours", "Opening hours", "e.g. Mon–Sat 10am–8pm. Only enter what is true.")}
          {t("contactEmail", "Contact email", undefined, "email")}
          {t("mapsUrl", "Google Maps link", "The “Share” link for your shop.", "url")}
          {t("mapsEmbedUrl", "Google Maps embed link", "From Google Maps → Share → Embed a map → the src value.", "url")}
        </fieldset>
        <fieldset className="space-y-4"><legend className="text-lg font-bold">Official social profiles</legend>
          {t("facebook", "Facebook", undefined, "url")}{t("instagram", "Instagram", undefined, "url")}{t("tiktok", "TikTok", undefined, "url")}{t("youtube", "YouTube", undefined, "url")}
        </fieldset>
        <fieldset className="space-y-2"><legend className="text-lg font-bold">Payment methods offered at checkout</legend>
          <label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input type="checkbox" name="codEnabled" defaultChecked={s.codEnabled} className="h-5 w-5" /> Cash on delivery (still limited by each delivery zone)</label>
          <label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input type="checkbox" name="bankTransferEnabled" defaultChecked={s.bankTransferEnabled} className="h-5 w-5" /> Bank transfer</label>
          <p className="text-xs text-muted">Online payment gateways are listed on the Payments page. None can be switched on until it is genuinely connected.</p>
        </fieldset>
        <fieldset className="space-y-4"><legend className="text-lg font-bold">Bank transfer details</legend>
          <p className="text-sm text-muted">Shown to customers who choose bank transfer. Leave empty to share details privately on WhatsApp instead.</p>
          {t("bankName", "Bank name")}{t("bankAccountTitle", "Account title")}{t("bankAccountNumber", "Account number / IBAN")}
        </fieldset>
        <fieldset className="space-y-4"><legend className="text-lg font-bold">Homepage</legend>
          {t("announcement", "Announcement bar", "Only verified offers or delivery notices. Empty hides the bar.")}
          {t("heroTitle", "Hero headline")}{t("heroSubtitle", "Hero text")}
        </fieldset>
        <fieldset className="space-y-4"><legend className="text-lg font-bold">Repair services</legend>
          <Field label="Repairs you actually offer" id="repairServices" hint="One per line, e.g. Screen replacement. Shown on the repair page and as choices in the request form. Leave empty to show no list.">
            <textarea id="repairServices" name="repairServices" rows={5} defaultValue={s.repairServices.join("\n")} className={`${inputCls} h-auto py-2`} />
          </Field>
        </fieldset>
        <fieldset className="space-y-4"><legend className="text-lg font-bold">About page: founder</legend>
          <label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input type="checkbox" name="showFounder" defaultChecked={s.showFounder} className="h-5 w-5" /> Show a founder section (Ali Hassan) on the About page</label>
          <Field label="Founder message" id="founderMessage" hint="Only text Ali Hassan has approved."><textarea id="founderMessage" name="founderMessage" rows={3} defaultValue={s.founderMessage ?? ""} className={`${inputCls} h-auto py-2`} /></Field>
          {t("founderPhotoUrl", "Founder photo URL", "A real photo he has approved. https only.", "url")}
        </fieldset>
        <fieldset className="space-y-4"><legend className="text-lg font-bold">Policy specifics</legend>
          <p className="text-sm text-muted">Your own approved wording, shown on the policy pages (simple formatting: **bold**, - lists, [links](https://…)). Leave empty to show “to be confirmed”. Do not copy terms you have not decided.</p>
          <Field label="Delivery terms" id="shippingTerms"><textarea id="shippingTerms" name="shippingTerms" rows={4} defaultValue={s.shippingTerms ?? ""} className={`${inputCls} h-auto py-2`} /></Field>
          <Field label="Returns and refunds terms" id="returnsTerms" hint="For example the return window and conditions, only once decided."><textarea id="returnsTerms" name="returnsTerms" rows={4} defaultValue={s.returnsTerms ?? ""} className={`${inputCls} h-auto py-2`} /></Field>
          <Field label="Warranty terms" id="warrantyTerms"><textarea id="warrantyTerms" name="warrantyTerms" rows={4} defaultValue={s.warrantyTerms ?? ""} className={`${inputCls} h-auto py-2`} /></Field>
        </fieldset>
        <fieldset className="space-y-3"><legend className="text-lg font-bold">Policies</legend>
          <label className="flex items-start gap-3 text-sm font-semibold"><input type="checkbox" name="policiesApproved" defaultChecked={s.policiesApproved} className="mt-0.5 h-5 w-5" /> I have reviewed and approved the shipping, returns, warranty, privacy and terms pages. (Removes the “draft” notice.)</label>
        </fieldset>
        <Submit>Save settings</Submit>
      </KeepForm>
    </div>
  );
}
