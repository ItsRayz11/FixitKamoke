import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/lib/db";
import { migrate } from "@/lib/db/migrate";
import { createRepairInquiry, findRepairByToken, respondToEstimate, updateRepair } from "@/lib/repairs/repairs";
import { repairStep } from "@/components/repairs/repair-steps";

let db: Db;
const input = { customerName: "Rita Repair", phone: "0300 1234567", email: "r@example.test", deviceBrand: "Samsung", deviceModel: "A54", issue: "Cracked screen after a fall", preferredContact: "call" };

async function fresh() {
  const r = await createRepairInquiry(db, input);
  const id = (await db.query<{ id: string }>("select id from repair_inquiries where reference = $1", [r.reference]))[0].id;
  return { ...r, id };
}
const row = async (id: string) => (await db.query<{ status: string; estimate_amount: number | null; approved_at: string | null; approved_amount: number | null; approved_by: string | null }>("select status, estimate_amount, approved_at, approved_amount, approved_by from repair_inquiries where id = $1", [id]))[0];

beforeAll(async () => { db = await createPgliteDb(); await migrate(db); });
afterAll(() => db.close());

describe("repair approval", () => {
  it("shows no approval request until staff have set a price and shared it", async () => {
    const r = await fresh();
    expect((await findRepairByToken(db, r.reference, r.token))?.canRespond).toBe(false);
    await updateRepair(db, r.id, { to: "reviewing" }, "staff");
    await updateRepair(db, r.id, { to: "estimate_sent", estimateAmount: 4500 }, "staff");
    const v = await findRepairByToken(db, r.reference, r.token);
    expect(v).toMatchObject({ canRespond: true, estimateAmount: 4500, estimateIsConfirmed: false });
  });

  it("work cannot start without the customer's approval of the current price", async () => {
    const r = await fresh();
    await updateRepair(db, r.id, { to: "reviewing" }, "staff");
    await updateRepair(db, r.id, { to: "estimate_sent", estimateAmount: 4500 }, "staff");
    await expect(updateRepair(db, r.id, { to: "in_repair" }, "staff")).rejects.toThrow(/cannot move|not approved/);
  });

  it("the customer approves the exact price: the repair is booked in and the approval is recorded", async () => {
    const r = await fresh();
    await updateRepair(db, r.id, { to: "reviewing" }, "staff");
    await updateRepair(db, r.id, { to: "estimate_sent", estimateAmount: 4500 }, "staff");
    await respondToEstimate(db, r.reference, r.token, "approve", 4500);
    expect(await row(r.id)).toMatchObject({ status: "booked", approved_amount: 4500, approved_by: "customer" });
    expect((await findRepairByToken(db, r.reference, r.token))?.canRespond).toBe(false);
    await updateRepair(db, r.id, { to: "in_repair" }, "staff"); // now allowed
    expect((await row(r.id)).status).toBe("in_repair");
  });

  it("an approval of an out-of-date price is refused, so a customer never agrees to a number they did not see", async () => {
    const r = await fresh();
    await updateRepair(db, r.id, { to: "reviewing" }, "staff");
    await updateRepair(db, r.id, { to: "estimate_sent", estimateAmount: 4500 }, "staff");
    await updateRepair(db, r.id, { estimateAmount: 6000 }, "staff"); // staff changed it while the customer was looking
    await expect(respondToEstimate(db, r.reference, r.token, "approve", 4500)).rejects.toThrow(/updated while you were looking/);
    expect((await row(r.id)).approved_at).toBeNull();
  });

  it("changing the price after approval cancels the approval, and work cannot start until it is given again", async () => {
    const r = await fresh();
    await updateRepair(db, r.id, { to: "reviewing" }, "staff");
    await updateRepair(db, r.id, { to: "estimate_sent", estimateAmount: 4500 }, "staff");
    await respondToEstimate(db, r.reference, r.token, "approve", 4500);
    await updateRepair(db, r.id, { estimateAmount: 5200 }, "staff");
    expect(await row(r.id)).toMatchObject({ status: "booked", approved_at: null, approved_amount: null });
    expect((await findRepairByToken(db, r.reference, r.token))?.canRespond).toBe(true); // asked again, even though already booked
    await expect(updateRepair(db, r.id, { to: "in_repair" }, "staff")).rejects.toThrow(/not approved/);
    await respondToEstimate(db, r.reference, r.token, "approve", 5200);
    await updateRepair(db, r.id, { to: "in_repair" }, "staff");
  });

  it("staff can record an approval given by phone by booking the repair in, but only with a price", async () => {
    const r = await fresh();
    await updateRepair(db, r.id, { to: "reviewing" }, "staff");
    await updateRepair(db, r.id, { to: "awaiting_customer" }, "staff");
    await expect(updateRepair(db, r.id, { to: "booked" }, "staff@test")).rejects.toThrow(/Enter the price/);
    await updateRepair(db, r.id, { to: "booked", estimateAmount: 3000 }, "staff@test");
    expect(await row(r.id)).toMatchObject({ approved_amount: 3000, approved_by: "staff@test" });
  });

  it("the customer can decline, which cancels the request; a wrong token or nothing-to-approve is refused", async () => {
    const r = await fresh();
    await expect(respondToEstimate(db, r.reference, r.token, "approve", 100)).rejects.toThrow(/nothing to approve/);
    await updateRepair(db, r.id, { to: "reviewing" }, "staff");
    await updateRepair(db, r.id, { to: "estimate_sent", estimateAmount: 4500 }, "staff");
    await expect(respondToEstimate(db, r.reference, "wrong-token-value", "approve", 4500)).rejects.toThrow(/could not find/);
    await respondToEstimate(db, r.reference, r.token, "decline", 4500);
    expect((await row(r.id)).status).toBe("cancelled");
  });

  it("an approval is queued as a status email once and staff are alerted", async () => {
    const r = await fresh();
    await updateRepair(db, r.id, { to: "reviewing" }, "staff");
    await updateRepair(db, r.id, { to: "estimate_sent", estimateAmount: 4500 }, "staff");
    await respondToEstimate(db, r.reference, r.token, "approve", 4500);
    expect((await db.query("select 1 from notification_outbox where dedupe_key = $1", [`repair_status:${r.reference}:booked`])).length).toBe(1);
  });
});

describe("the four-step guide", () => {
  it("maps each repair status to its step", () => {
    expect(repairStep("new")).toBe(0);
    expect(repairStep("reviewing")).toBe(0);
    expect(repairStep("estimate_sent")).toBe(1);
    expect(repairStep("awaiting_customer")).toBe(1);
    expect(repairStep("booked")).toBe(2);
    expect(repairStep("in_repair")).toBe(3);
    expect(repairStep("completed")).toBe(3);
    expect(repairStep("cancelled")).toBe(-1);
    expect(repairStep("declined")).toBe(-1);
  });
});
