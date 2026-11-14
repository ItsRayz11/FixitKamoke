import { getAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { can, permsFor } from "@/lib/finance/perms-core";
import { returnGoodsAction } from "@/app/admin/(panel)/finance/actions";
import { Card, inputCls, Submit } from "./ui";

/** After delivery, put goods that came back in good condition back on the shelf. Damaged ones are simply not entered. */
export async function ReturnGoods({ orderId, status }: { orderId: string; status: string }) {
  if (!["delivered", "return_requested", "returned"].includes(status)) return null;
  const admin = await getAdmin();
  if (!admin) return null;
  const db = await getDb();
  const granted = (await db.query<{ finance_perms: string[] }>("select finance_perms from admin_users where id = $1", [admin.id]))[0]?.finance_perms ?? [];
  if (!can({ role: admin.role, perms: permsFor(admin.role, granted) }, "finance_write")) return null;
  const items = await db.query<{ id: string; product_name: string; quantity: number; returned_qty: number; product_id: string | null }>("select id, product_name, quantity, returned_qty, product_id from order_items where order_id = $1 order by id", [orderId]);
  const open = items.filter((i) => i.product_id && i.quantity - i.returned_qty > 0);
  return (
    <div className="mt-4"><Card title="Returned goods" id="return-goods">
      <p className="mt-1 text-sm text-muted">Enter how many of each item came back in good condition. They go back to stock at the cost they left with. Damaged items are not entered. Record any refund separately above.</p>
      {open.length === 0 ? <p className="mt-2 text-sm text-muted">Nothing left to return on this order.</p> : (
        <form action={returnGoodsAction} className="mt-3 space-y-2">
          <input type="hidden" name="orderId" value={orderId} />
          {open.map((i) => (
            <label key={i.id} className="flex items-center justify-between gap-3 text-sm"><span>{i.product_name} <span className="text-muted">(up to {i.quantity - i.returned_qty})</span></span>
              <input name={`good_${i.id}`} inputMode="numeric" defaultValue={0} aria-label={`Good ${i.product_name} returned`} className={`${inputCls} !mt-0 w-20`} /></label>
          ))}
          <Submit>Put back in stock</Submit>
        </form>
      )}
    </Card></div>
  );
}
