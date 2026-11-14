import { getDb, type Db } from "@/lib/db";

export type PolicyKind = "return" | "warranty";
export interface ProductPolicy { id: string; kind: PolicyKind; name: string; summary: string | null; body: string; isDefault: boolean; sortOrder: number }

interface Row { id: string; kind: PolicyKind; name: string; summary: string | null; body: string; is_default: boolean; sort_order: number }
const map = (r: Row): ProductPolicy => ({ id: r.id, kind: r.kind, name: r.name, summary: r.summary, body: r.body, isDefault: r.is_default, sortOrder: r.sort_order });
const COLS = "id, kind, name, summary, body, is_default, sort_order";

export async function listPolicies(kind?: PolicyKind): Promise<ProductPolicy[]> {
  const db = await getDb();
  const rows = kind
    ? await db.query<Row>(`select ${COLS} from product_policies where kind = $1 order by sort_order, name`, [kind])
    : await db.query<Row>(`select ${COLS} from product_policies order by kind, sort_order, name`);
  return rows.map(map);
}

/** The return and warranty policy a product shows: the one chosen on the product, otherwise that kind's default, otherwise none. */
export async function policiesForProduct(productId: string, db0?: Db): Promise<{ return: ProductPolicy | null; warranty: ProductPolicy | null }> {
  const db = db0 ?? (await getDb());
  const rows = await db.query<Row>(
    `select ${COLS} from product_policies pp where pp.id in (select return_policy_id from products where id = $1 union select warranty_policy_id from products where id = $1)
        or (pp.is_default and pp.kind = 'return' and (select return_policy_id from products where id = $1) is null)
        or (pp.is_default and pp.kind = 'warranty' and (select warranty_policy_id from products where id = $1) is null)`, [productId]);
  const all = rows.map(map);
  return { return: all.find((p) => p.kind === "return") ?? null, warranty: all.find((p) => p.kind === "warranty") ?? null };
}
