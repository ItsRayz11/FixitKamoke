import crypto from "node:crypto";
import { z } from "zod";
import type { Db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { queueStaffAlert } from "@/lib/email/alerts";
import { normalizePkMobile } from "@/lib/domain/phone";
import { canRepairTransition, type RepairStatus } from "@/lib/domain/repair-state";

export const repairSchema = z.object({
  customerName: z.string().trim().min(2, "Please enter your name").max(100),
  phone: z.string().trim().min(10, "Please enter a valid Pakistani mobile number.").max(20, "Please enter a valid Pakistani mobile number."),
  email: z.string().trim().email("Please enter a valid email").max(200).optional().or(z.literal("").transform(() => undefined)),
  deviceBrand: z.string().trim().min(2, "Please enter the phone brand").max(60),
  deviceModel: z.string().trim().min(1, "Please enter the phone model").max(80),
  issue: z.string().trim().min(5, "Please describe the problem").max(1500),
  preferredContact: z.enum(["whatsapp", "call", "email"]),
  appointmentPreference: z.string().trim().max(200).optional().or(z.literal("").transform(() => undefined)),
});
export type RepairInput = z.infer<typeof repairSchema>;

export class RepairError extends Error {
  constructor(public code: "invalid_phone" | "not_found" | "bad_transition" | "bad_input", message: string) { super(message); }
}

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
export const hashRepairToken = sha;

export async function createRepairInquiry(db: Db, raw: unknown): Promise<{ reference: string; token: string }> {
  const d = repairSchema.parse(raw);
  const phone = normalizePkMobile(d.phone);
  if (!phone) throw new RepairError("invalid_phone", "Please enter a valid Pakistani mobile number.");
  const reference = "RP-" + crypto.randomBytes(5).toString("hex").toUpperCase();
  const token = crypto.randomBytes(24).toString("base64url");
  await db.tx(async (q) => {
    const r = await q.query<{ id: string }>(
      `insert into repair_inquiries(reference, tracking_token_hash, customer_name, phone, email, device_brand, device_model, issue, preferred_contact, appointment_preference)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
      [reference, sha(token), d.customerName, phone, d.email ?? null, d.deviceBrand, d.deviceModel, d.issue, d.preferredContact, d.appointmentPreference ?? null]);
    await q.query("insert into repair_status_history(repair_id, from_status, to_status, actor) values ($1, null, 'new', 'customer')", [r[0].id]);
    await q.query("insert into analytics_events(name, path) values ('repair_submitted', '/repairs')");
    await queueStaffAlert(q, "repair", reference, `${d.deviceBrand} ${d.deviceModel}: ${d.issue.slice(0, 80)}`);
    if (d.email) {
      await q.query("insert into notification_outbox(kind, recipient, payload, dedupe_key) values ('repair_received', $1, $2, $3) on conflict (dedupe_key) do nothing",
        [d.email, JSON.stringify({ reference }), `repair_received:${reference}`]);
    }
  });
  return { reference, token };
}

export interface RepairView {
  reference: string;
  status: RepairStatus;
  deviceBrand: string;
  deviceModel: string;
  issue: string;
  createdAt: string;
  estimateAmount: number | null;
  estimateIsConfirmed: boolean;
  customerMessage: string | null;
  history: { status: string; at: string }[];
}

interface Row {
  id: string; reference: string; status: RepairStatus; device_brand: string; device_model: string; issue: string; created_at: Date | string;
  estimate_amount: number | null; estimate_is_confirmed: boolean; customer_message: string | null; phone: string; tracking_token_hash: string;
}
const eq = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const COLS = "id, reference, status, device_brand, device_model, issue, created_at, estimate_amount, estimate_is_confirmed, customer_message, phone, tracking_token_hash";

async function view(db: Db, r: Row): Promise<RepairView> {
  const h = await db.query<{ to_status: string; created_at: Date | string }>("select to_status, created_at from repair_status_history where repair_id = $1 order by created_at, id", [r.id]);
  return {
    reference: r.reference, status: r.status, deviceBrand: r.device_brand, deviceModel: r.device_model, issue: r.issue, createdAt: new Date(r.created_at).toISOString(),
    estimateAmount: r.estimate_amount, estimateIsConfirmed: r.estimate_is_confirmed, customerMessage: r.customer_message,
    history: h.map((x) => ({ status: x.to_status, at: new Date(x.created_at).toISOString() })),
  };
}

export async function findRepairByToken(db: Db, reference: string, token: string): Promise<RepairView | null> {
  const r = (await db.query<Row>(`select ${COLS} from repair_inquiries where reference = $1`, [reference.toUpperCase()]))[0];
  return r && eq(r.tracking_token_hash, sha(token)) ? view(db, r) : null;
}

export async function findRepairByPhone(db: Db, reference: string, phone: string): Promise<RepairView | null> {
  const norm = normalizePkMobile(phone);
  if (!norm) return null;
  const r = (await db.query<Row>(`select ${COLS} from repair_inquiries where reference = $1`, [reference.trim().toUpperCase()]))[0];
  return r && eq(r.phone, norm) ? view(db, r) : null;
}

export interface RepairUpdate {
  to?: RepairStatus;
  estimateAmount?: number | null;
  estimateIsConfirmed?: boolean;
  customerMessage?: string | null;
  staffNotes?: string | null;
  note?: string;
}

/** Staff update. Status moves are validated; an amount can only be marked "confirmed" together with an amount. */
export async function updateRepair(db: Db, id: string, u: RepairUpdate, actor: string): Promise<void> {
  if (u.estimateAmount !== undefined && u.estimateAmount !== null && (!Number.isSafeInteger(u.estimateAmount) || u.estimateAmount < 0 || u.estimateAmount > 10_000_000)) {
    throw new RepairError("bad_input", "Enter a price in whole rupees.");
  }
  await db.tx(async (q) => {
    const rows = await q.query<{ reference: string; status: RepairStatus; email: string | null; estimate_amount: number | null }>(
      "select reference, status, email, estimate_amount from repair_inquiries where id = $1 for update", [id]);
    const r = rows[0];
    if (!r) throw new RepairError("not_found", "Repair request not found.");
    const amount = u.estimateAmount === undefined ? r.estimate_amount : u.estimateAmount;
    if (u.estimateIsConfirmed && amount === null) throw new RepairError("bad_input", "Enter a price before marking it as confirmed.");
    if (u.to && u.to !== r.status && !canRepairTransition(r.status, u.to)) {
      throw new RepairError("bad_transition", `A request that is “${r.status.replace(/_/g, " ")}” cannot move to “${u.to.replace(/_/g, " ")}”.`);
    }
    await q.query(
      // undefined/null leaves a text field alone; an empty string clears it.
      `update repair_inquiries set estimate_amount = $2, estimate_is_confirmed = $3,
         customer_message = case when $4::text is null then customer_message else nullif($4::text, '') end,
         staff_notes = case when $5::text is null then staff_notes else nullif($5::text, '') end, status = $6, updated_at = now() where id = $1`,
      [id, amount, amount === null ? false : (u.estimateIsConfirmed ?? false), u.customerMessage ?? null, u.staffNotes ?? null, u.to ?? r.status]);
    if (u.to && u.to !== r.status) {
      await q.query("insert into repair_status_history(repair_id, from_status, to_status, actor, note) values ($1,$2,$3,$4,$5)", [id, r.status, u.to, actor, u.note ?? null]);
      if (r.email) {
        await q.query("insert into notification_outbox(kind, recipient, payload, dedupe_key) values ('repair_status', $1, $2, $3) on conflict (dedupe_key) do nothing",
          [r.email, JSON.stringify({ reference: r.reference, status: u.to }), `repair_status:${r.reference}:${u.to}`]);
      }
    }
    await audit(actor, "repair_updated", "repair", id, { reference: r.reference, to: u.to ?? null, amount, confirmed: u.estimateIsConfirmed ?? false }, q);
  });
}
