"use client";

import { useRef, useState, useTransition, type FormEvent, type KeyboardEvent } from "react";
import { saveProductAction } from "@/app/admin/(panel)/products/actions";
import { Field, inputCls } from "./ui";
import type { Category } from "@/lib/catalog";
import { ImageUploader } from "./image-uploader";
import { ImagePreviews } from "./image-previews";
import { percentOff } from "@/lib/domain/sale";

export interface ProductFormValues {
  id?: string; name: string; slug: string; brand: string; categoryId: string; description: string; price: number | ""; salePrice: number | ""; saleStarts: string; saleEnds: string;
  sku: string; stock: number | ""; status: "draft" | "active" | "archived"; seoTitle: string; seoDescription: string; warranty: string; weight: number | ""; specs: string; devices: string; images: string; spin: string;
  variantGroup: string; variantLabel: string; variantHex: string; variantRequired: boolean;
}

export const emptyProduct: ProductFormValues = {
  name: "", slug: "", brand: "", categoryId: "", description: "", price: "", salePrice: "", saleStarts: "", saleEnds: "", sku: "", stock: 0, status: "draft", seoTitle: "", seoDescription: "",
  warranty: "", weight: "", specs: "", devices: "", images: "", spin: "",
  variantGroup: "", variantLabel: "", variantHex: "", variantRequired: false,
};

const TABS = [
  { id: "basics", label: "Basics" },
  { id: "pricing", label: "Pricing" },
  { id: "inventory", label: "Inventory" },
  { id: "media", label: "Media" },
  { id: "variants", label: "Variants" },
  { id: "seo", label: "SEO" },
  { id: "publishing", label: "Publishing" },
] as const;
type TabId = (typeof TABS)[number]["id"];

/** When the server refuses a save, jump to the tab that holds the problem so the owner sees it straight away. */
function tabForError(msg: string): TabId | null {
  const m = msg.toLowerCase();
  if (/sale|price/.test(m)) return "pricing";
  if (/stock|weight|warranty/.test(m)) return "inventory";
  if (/image|photo|turntable|frame|https/.test(m)) return "media";
  if (/finish|colour|color/.test(m)) return "variants";
  if (/page title|page description/.test(m)) return "seo";
  if (/name|web address|slug/.test(m)) return "basics";
  return null;
}

const area = `${inputCls} h-auto py-2`;

export function ProductForm({ v, categories, uploads = false }: { v: ProductFormValues; categories: Category[]; uploads?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [tab, setTab] = useState<TabId>("basics");
  const [price, setPrice] = useState(String(v.price));
  const [sale, setSale] = useState(String(v.salePrice));
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Submitted by hand instead of <form action>: React then never resets the inputs, so a rejected save keeps everything typed.
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const fd = new FormData(e.currentTarget);
    setError(null);
    start(async () => {
      const r = await saveProductAction({}, fd); // success redirects; only failures return
      if (r?.error) {
        setError(r.error);
        const t = tabForError(r.error);
        if (t) setTab(t);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  }

  function onKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const next = e.key === "ArrowRight" ? (i + 1) % TABS.length : e.key === "ArrowLeft" ? (i + TABS.length - 1) % TABS.length : e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    setTab(TABS[next].id);
    tabRefs.current[TABS[next].id]?.focus();
  }

  const off = percentOff(Number(price), sale === "" ? null : Number(sale));
  // Every panel stays in the page (just hidden), so one Save sends all of them and nothing typed in another tab is lost.
  const panel = (id: TabId) => ({ id: `panel-${id}`, role: "tabpanel" as const, "aria-labelledby": `tab-${id}`, hidden: tab !== id, className: "min-w-0 space-y-4" });

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-3xl pb-24">
      {error && <p role="alert" className="mb-3 rounded-[var(--radius-sm)] bg-red-50 p-3 text-sm font-semibold text-danger">{error}</p>}
      {v.id && <input type="hidden" name="id" value={v.id} />}

      <div role="tablist" aria-label="Product sections" className="flex flex-wrap gap-1 border-b border-line">
        {TABS.map((t, i) => (
          <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} tabIndex={tab === t.id ? 0 : -1}
            ref={(el) => { tabRefs.current[t.id] = el; }} onClick={() => setTab(t.id)} onKeyDown={(e) => onKey(e, i)}
            className={`min-h-11 shrink-0 border-b-2 px-3 text-sm font-semibold transition-colors ${tab === t.id ? "border-accent text-accent" : "border-transparent text-muted hover:text-text"}`}>{t.label}</button>
        ))}
      </div>

      <div className="mt-4">
        <div {...panel("basics")}>
          <Field label="Product name" id="name"><input id="name" name="name" required defaultValue={v.name} className={inputCls} /></Field>
          <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
            <Field label="Web address (slug)" id="slug" hint="Blank = made from the name."><input id="slug" name="slug" defaultValue={v.slug} className={inputCls} /></Field>
            <Field label="Brand" id="brand"><input id="brand" name="brand" defaultValue={v.brand} className={inputCls} /></Field>
            <Field label="Category" id="categoryId">
              <select id="categoryId" name="categoryId" defaultValue={v.categoryId} className={inputCls}>
                <option value="">No category</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="SKU" id="sku"><input id="sku" name="sku" defaultValue={v.sku} className={inputCls} /></Field>
          </div>
          <Field label="Description" id="description"><textarea id="description" name="description" rows={4} defaultValue={v.description} className={area} /></Field>
          <Field label="Specifications" id="specs" hint="One per line: Name: value. Only facts you have checked."><textarea id="specs" name="specs" rows={4} defaultValue={v.specs} className={`${area} font-mono`} /></Field>
          <Field label="Compatible devices" id="devices" hint="Comma or line separated."><textarea id="devices" name="devices" rows={2} defaultValue={v.devices} className={area} /></Field>
        </div>

        <div {...panel("pricing")}>
          <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
            <Field label="Price (Rs.)" id="price" hint="The regular price."><input id="price" name="price" inputMode="numeric" required value={price} onChange={(e) => setPrice(e.target.value)} className={inputCls} /></Field>
            <Field label="Sale price (Rs.)" id="salePrice" hint="Optional. Lower than the price."><input id="salePrice" name="salePrice" inputMode="numeric" value={sale} onChange={(e) => setSale(e.target.value)} className={inputCls} /></Field>
            <Field label="Sale starts" id="saleStarts" hint="Optional. Empty = now."><input id="saleStarts" name="saleStarts" type="date" defaultValue={v.saleStarts} className={inputCls} /></Field>
            <Field label="Sale ends" id="saleEnds" hint="Optional. Last day of the sale."><input id="saleEnds" name="saleEnds" type="date" defaultValue={v.saleEnds} className={inputCls} /></Field>
          </div>
          <p className="rounded-[var(--radius-sm)] bg-canvas p-3 text-sm" aria-live="polite" data-testid="price-preview">
            {off !== null ? <>Customers see <strong>Rs. {Number(sale).toLocaleString("en-PK")}</strong> with <s>Rs. {Number(price).toLocaleString("en-PK")}</s> and a <strong>−{off}%</strong> badge.</>
              : sale !== "" && Number(sale) >= Number(price) ? <span className="text-danger">The sale price must be lower than the price.</span>
              : <>No sale. Customers see the regular price.</>}
          </p>
        </div>

        <div {...panel("inventory")}>
          <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
            <Field label="Stock quantity" id="stock"><input id="stock" name="stock" inputMode="numeric" required defaultValue={v.stock} className={inputCls} /></Field>
            <Field label="Weight (grams)" id="weight"><input id="weight" name="weight" inputMode="numeric" defaultValue={v.weight} className={inputCls} /></Field>
          </div>
          <Field label="Warranty information" id="warranty" hint="Only wording the owner has approved."><input id="warranty" name="warranty" defaultValue={v.warranty} className={inputCls} /></Field>
        </div>

        <div {...panel("media")}>
          <Field label="Image URLs" id="images" hint="One per line, https only, up to 10. The first is the main photo. Optional text after | describes it.">
            <textarea id="images" name="images" rows={3} defaultValue={v.images} className={`${area} font-mono`} placeholder="https://…/photo.jpg|Front view" />
          </Field>
          <ImageUploader targetId="images" kind="photo" enabled={uploads} label="Upload photos from this device" />
          <ImagePreviews targetId="images" label="Photos" />
          <fieldset className="grid gap-3 rounded-[var(--radius-md)] border border-line bg-surface p-4">
            <legend className="px-1 text-sm font-bold">360° turntable view (optional)</legend>
            <p className="text-xs text-muted">Real photos of this item turning, 24 to 36 frames, same camera and light.</p>
            <Field label="Turntable frame links" id="spin" hint="One https link per line, in turning order. 8 to 72 frames.">
              <textarea id="spin" name="spin" rows={3} defaultValue={v.spin} className={`${area} font-mono`} placeholder="https://…/01.jpg" />
            </Field>
            <ImageUploader targetId="spin" kind="spin" enabled={uploads} label="Upload turntable frames" />
          </fieldset>
        </div>

        <div {...panel("variants")}>
          <fieldset className="grid gap-4 rounded-[var(--radius-md)] border border-line bg-surface p-4">
            <legend className="px-1 text-sm font-bold">Finish / colour (optional)</legend>
            <p className="text-xs text-muted">Each finish is its own product with its own stock and photos. Give all finishes of one item the same group, and a different finish name.</p>
            <div className="grid gap-4 sm:grid-cols-3 [&>*]:min-w-0">
              <Field label="Finish group" id="variantGroup" hint="Same on every finish, e.g. braided-cable-2m."><input id="variantGroup" name="variantGroup" defaultValue={v.variantGroup} className={inputCls} /></Field>
              <Field label="Finish name" id="variantLabel" hint="e.g. Titanium Grey"><input id="variantLabel" name="variantLabel" defaultValue={v.variantLabel} className={inputCls} /></Field>
              <Field label="Swatch colour" id="variantHex" hint="Hex like #A7B0BC."><input id="variantHex" name="variantHex" defaultValue={v.variantHex} placeholder="#A7B0BC" className={inputCls} /></Field>
            </div>
            <label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input type="checkbox" name="variantRequired" defaultChecked={v.variantRequired} className="h-5 w-5" /> Customer must choose a finish</label>
          </fieldset>
        </div>

        <div {...panel("seo")}>
          <Field label="Page title" id="seoTitle" hint="Up to 70 characters. Blank = the product name."><input id="seoTitle" name="seoTitle" maxLength={70} defaultValue={v.seoTitle} className={inputCls} /></Field>
          <Field label="Page description" id="seoDescription" hint="Up to 160 characters. Blank = the start of the description."><textarea id="seoDescription" name="seoDescription" rows={2} maxLength={160} defaultValue={v.seoDescription} className={area} /></Field>
        </div>

        <div {...panel("publishing")}>
          <fieldset className="rounded-[var(--radius-md)] border border-line bg-surface p-4">
            <legend className="px-1 text-sm font-bold">Status</legend>
            {([["draft", "Draft", "Hidden from the store. Keep working on it."], ["active", "Active", "Visible in the store and can be bought."], ["archived", "Archived", "Hidden, kept for your records."]] as const).map(([val, label, hint]) => (
              <label key={val} className="flex min-h-11 items-start gap-3 py-1 text-sm"><input type="radio" name="status" value={val} defaultChecked={v.status === val} className="mt-0.5 h-5 w-5" /><span className="min-w-0"><span className="font-semibold">{label}</span><span className="block text-xs text-muted">{hint}</span></span></label>
            ))}
          </fieldset>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-[calc(3.5rem+var(--safe-bottom))] z-20 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur lg:sticky lg:bottom-0 lg:mt-6 lg:rounded-[var(--radius-md)] lg:border lg:px-4">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <button disabled={pending} className="min-h-11 rounded-[var(--radius-sm)] bg-accent px-6 text-sm font-semibold text-white hover:bg-accent-strong disabled:bg-slate-300">{pending ? "Saving…" : "Save product"}</button>
          <span className="text-xs text-muted">Saves every section.</span>
        </div>
      </div>
    </form>
  );
}
