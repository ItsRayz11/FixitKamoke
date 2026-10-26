"use client";

import { useState, useTransition, type FormEvent } from "react";
import { saveProductAction } from "@/app/admin/(panel)/products/actions";
import { Field, inputCls } from "./ui";
import type { Category } from "@/lib/catalog";
import { ImageUploader } from "./image-uploader";

export interface ProductFormValues {
  id?: string; name: string; slug: string; brand: string; categoryId: string; description: string; price: number | ""; salePrice: number | "";
  sku: string; stock: number | ""; published: boolean; warranty: string; weight: number | ""; specs: string; devices: string; images: string; spin: string;
  variantGroup: string; variantLabel: string; variantHex: string; variantRequired: boolean;
}

export const emptyProduct: ProductFormValues = {
  name: "", slug: "", brand: "", categoryId: "", description: "", price: "", salePrice: "", sku: "", stock: 0, published: false,
  warranty: "", weight: "", specs: "", devices: "", images: "", spin: "",
  variantGroup: "", variantLabel: "", variantHex: "", variantRequired: false,
};

export function ProductForm({ v, categories, uploads = false }: { v: ProductFormValues; categories: Category[]; uploads?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // Submitted by hand instead of <form action>: React then never resets the inputs, so a rejected save keeps everything typed.
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const fd = new FormData(e.currentTarget);
    setError(null);
    start(async () => {
      const r = await saveProductAction({}, fd); // success redirects; only failures return
      if (r?.error) { setError(r.error); window.scrollTo({ top: 0, behavior: "smooth" }); }
    });
  }
  return (
    <form onSubmit={onSubmit} className="grid max-w-3xl gap-4">
      {error && <p role="alert" className="rounded-[var(--radius-sm)] bg-red-50 p-3 text-sm font-semibold text-danger">{error}</p>}
      {v.id && <input type="hidden" name="id" value={v.id} />}
      <Field label="Product name" id="name"><input id="name" name="name" required defaultValue={v.name} className={inputCls} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Web address (slug)" id="slug" hint="Leave blank to generate from the name."><input id="slug" name="slug" defaultValue={v.slug} className={inputCls} /></Field>
        <Field label="Brand" id="brand"><input id="brand" name="brand" defaultValue={v.brand} className={inputCls} /></Field>
        <Field label="Category" id="categoryId">
          <select id="categoryId" name="categoryId" defaultValue={v.categoryId} className={inputCls}>
            <option value="">No category</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="SKU" id="sku"><input id="sku" name="sku" defaultValue={v.sku} className={inputCls} /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Price (Rs.)" id="price"><input id="price" name="price" inputMode="numeric" required defaultValue={v.price} className={inputCls} /></Field>
        <Field label="Sale price (Rs.)" id="salePrice" hint="Optional. Must be lower than the price."><input id="salePrice" name="salePrice" inputMode="numeric" defaultValue={v.salePrice} className={inputCls} /></Field>
        <Field label="Stock quantity" id="stock"><input id="stock" name="stock" inputMode="numeric" required defaultValue={v.stock} className={inputCls} /></Field>
      </div>
      <Field label="Description" id="description"><textarea id="description" name="description" rows={4} defaultValue={v.description} className={`${inputCls} h-auto py-2`} /></Field>
      <Field label="Specifications" id="specs" hint="One per line, as  Name: value  (e.g. Cable length: 1 m). Only enter facts you have verified."><textarea id="specs" name="specs" rows={4} defaultValue={v.specs} className={`${inputCls} h-auto py-2 font-mono`} /></Field>
      <Field label="Compatible devices" id="devices" hint="Comma or line separated, e.g. Samsung Galaxy A54, iPhone 13."><textarea id="devices" name="devices" rows={2} defaultValue={v.devices} className={`${inputCls} h-auto py-2`} /></Field>
      <Field label="Image URLs" id="images" hint="One per line, https only (up to 10). Optional description after a | character. Use photos of the real item.">
        <textarea id="images" name="images" rows={3} defaultValue={v.images} className={`${inputCls} h-auto py-2 font-mono`} placeholder="https://…/photo.jpg|Front view" />
      </Field>
      <ImageUploader targetId="images" kind="photo" enabled={uploads} label="Upload photos from this device" />
      <fieldset className="grid gap-3 rounded-[var(--radius-md)] border border-line bg-surface p-4">
        <legend className="px-1 text-sm font-bold">360° turntable view (optional)</legend>
        <p className="text-xs text-muted">Real photos of this exact item turning on a turntable, 24 to 36 frames, same camera position and light in every frame. Name the files 01, 02, 03 … in turning order. Customers drag, swipe or use arrow keys to rotate it. See the turntable guide in the project docs. Leave empty if you have not shot one.</p>
        <Field label="Turntable frame links" id="spin" hint="One https link per line, in rotation order. At least 8 frames, at most 72.">
          <textarea id="spin" name="spin" rows={3} defaultValue={v.spin} className={`${inputCls} h-auto py-2 font-mono`} placeholder="https://…/01.jpg" />
        </Field>
        <ImageUploader targetId="spin" kind="spin" enabled={uploads} label="Upload turntable frames" />
      </fieldset>
      <fieldset className="grid gap-4 rounded-[var(--radius-md)] border border-line bg-surface p-4">
        <legend className="px-1 text-sm font-bold">Finish / colour (optional)</legend>
        <p className="text-xs text-muted">
          Each finish is its own product with its own stock, SKU and photos. Give the finishes of one item the same name and the same finish group, then
          a different finish name. Customers see them as one product with colour choices. Use <strong>real photos of that exact finish</strong>:
          the picture changes when a finish is chosen.
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Finish group" id="variantGroup" hint="Same text on every finish of the item, e.g. braided-cable-2m."><input id="variantGroup" name="variantGroup" defaultValue={v.variantGroup} className={inputCls} /></Field>
          <Field label="Finish name" id="variantLabel" hint="e.g. Titanium Grey"><input id="variantLabel" name="variantLabel" defaultValue={v.variantLabel} className={inputCls} /></Field>
          <Field label="Swatch colour" id="variantHex" hint="Hex like #A7B0BC, matched to the real product."><input id="variantHex" name="variantHex" defaultValue={v.variantHex} placeholder="#A7B0BC" className={inputCls} /></Field>
        </div>
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input type="checkbox" name="variantRequired" defaultChecked={v.variantRequired} className="h-5 w-5" /> Customer must choose a finish (no default selected)</label>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Warranty information" id="warranty" hint="Only if the owner has approved the wording."><input id="warranty" name="warranty" defaultValue={v.warranty} className={inputCls} /></Field>
        <Field label="Weight (grams)" id="weight"><input id="weight" name="weight" inputMode="numeric" defaultValue={v.weight} className={inputCls} /></Field>
      </div>
      <label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input type="checkbox" name="published" defaultChecked={v.published} className="h-5 w-5" /> Published (visible in the store)</label>
      <div><button disabled={pending} className="min-h-11 rounded-[var(--radius-sm)] bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-strong disabled:bg-slate-300">{pending ? "Saving…" : "Save product"}</button></div>
    </form>
  );
}
