"use server";

import { z } from "zod";
import { getProductsByIds } from "@/lib/catalog";
import { displayName } from "@/lib/domain/display";

export interface CompareItem {
  id: string; slug: string; name: string; image: string | null; price: number; salePrice: number | null; stock: number;
  brand: string | null; devices: string[]; specs: Record<string, string>; warranty: string | null;
}

/** Public catalogue data only (published products), so it is safe to call with any ids. */
export async function getCompareItems(ids: unknown): Promise<CompareItem[]> {
  const parsed = z.array(z.string().uuid()).max(3).safeParse(ids);
  if (!parsed.success) return [];
  const found = await getProductsByIds(parsed.data);
  const byId = new Map(found.map((p) => [p.id, p]));
  return parsed.data.flatMap((id) => {
    const p = byId.get(id);
    return p
      ? [{ id: p.id, slug: p.slug, name: displayName(p.name, p.variantLabel), image: p.image?.url ?? null, price: p.price, salePrice: p.salePrice, stock: p.stock, brand: p.brand, devices: p.compatibleDevices, specs: p.specs, warranty: p.warrantyInfo }]
      : [];
  });
}
