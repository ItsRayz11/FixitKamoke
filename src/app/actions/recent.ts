"use server";

import { z } from "zod";
import { effectivePrice, getProductsByIds } from "@/lib/catalog";

export interface RecentProduct { id: string; slug: string; name: string; price: number; stock: number }

/** Public catalogue data only (published products), so it is safe to call with any ids. */
export async function getRecentProducts(ids: unknown): Promise<RecentProduct[]> {
  const parsed = z.array(z.string().uuid()).max(12).safeParse(ids);
  if (!parsed.success) return [];
  const found = await getProductsByIds(parsed.data);
  const byId = new Map(found.map((p) => [p.id, p]));
  return parsed.data.flatMap((id) => { const p = byId.get(id); return p ? [{ id: p.id, slug: p.slug, name: p.name, price: effectivePrice(p), stock: p.stock }] : []; });
}
