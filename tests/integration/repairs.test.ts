import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/lib/db";
import { migrate } from "@/lib/db/migrate";
import { createRepairInquiry, findRepairByPhone, findRepairByToken, RepairError, updateRepair } from "@/lib/repairs/repairs";
import { canRepairTransition } from "@/lib/domain/repair-state";

let db: Db;
const input = {
  customerName: "Repair Customer", phone: "0300 7654321", email: "r@example.com", deviceBrand: "Samsung", deviceModel: "A54",
  issue: "Cracked screen after a drop", preferredContact: "whatsapp" as const,
};
const idOf = async (ref: string) => (await db.query<{ id: string }>("select id from repair_inquiries where reference = $1", [ref]))[0].id;

beforeAll(async () => { db = await createPgliteDb(); await migrate(db); });
afterAll(() => db.close());

describe("repair inquiries", () => {
  it("creates an inquiry with a reference, hashed token, history, outbox entry and funnel event", async () => {
    const { reference, token } = await createRepairInquiry(db, input);
    expect(reference).toMatch(/^RP-[0-9A-F]{10}$/);
    const row = (await db.query<{ phone: string; tracking_token_hash: string; status: string }>("select phone, tracking_token_hash, status from repair_inquiries"))[0];
    expect(row).toMatchObject({ phone: "+923007654321", status: "new" });
    expect(row.tracking_token_hash).not.toBe(token);
    expect((await db.query("select 1 from notification_outbox where kind = 'repair_received'")).length).toBe(1);
    expect((await db.query("select 1 from analytics_events where name = 'repair_submitted'")).length).toBe(1);
  });

  it("rejects bad phone numbers and short problem text", async () => {
    await expect(createRepairInquiry(db, { ...input, phone: "12345678901" })).rejects.toBeInstanceOf(RepairError);
    await expect(createRepairInquiry(db, { ...input, issue: "bad" })).rejects.toThrow();
  });

  it("only exposes a request with the token, or with reference + matching phone", async () => {
    const { reference, token } = await createRepairInquiry(db, input);
    expect(await findRepairByToken(db, reference, token)).not.toBeNull();
    expect(await findRepairByToken(db, reference, "wrong-token")).toBeNull();
    expect(await findRepairByPhone(db, reference, "+92 300 7654321")).not.toBeNull();
    expect(await findRepairByPhone(db, reference, "0311 0000000")).toBeNull();
  });

  it("never exposes internal staff notes to the customer view", async () => {
    const { reference, token } = await createRepairInquiry(db, input);
    await updateRepair(db, await idOf(reference), { staffNotes: "INTERNAL: customer is difficult", customerMessage: "Please bring the phone in." }, "staff@test");
    const v = await findRepairByToken(db, reference, token);
    expect(JSON.stringify(v)).not.toContain("INTERNAL");
    expect(v?.customerMessage).toBe("Please bring the phone in.");
  });

  it("lets staff clear a customer message, and leaves it alone when not supplied", async () => {
    const { reference, token } = await createRepairInquiry(db, input);
    const id = await idOf(reference);
    await updateRepair(db, id, { customerMessage: "Bring the box too." }, "s");
    await updateRepair(db, id, { staffNotes: "x" }, "s"); // message not supplied: unchanged
    expect((await findRepairByToken(db, reference, token))?.customerMessage).toBe("Bring the box too.");
    await updateRepair(db, id, { customerMessage: "" }, "s");
    expect((await findRepairByToken(db, reference, token))?.customerMessage).toBeNull();
  });

  it("distinguishes an estimate from a confirmed price and validates transitions", async () => {
    const { reference, token } = await createRepairInquiry(db, input);
    const id = await idOf(reference);
    await expect(updateRepair(db, id, { to: "completed" }, "s")).rejects.toMatchObject({ code: "bad_transition" });
    await expect(updateRepair(db, id, { estimateIsConfirmed: true }, "s")).rejects.toMatchObject({ code: "bad_input" });
    await updateRepair(db, id, { to: "reviewing" }, "s");
    await updateRepair(db, id, { to: "estimate_sent", estimateAmount: 4500, estimateIsConfirmed: false }, "s");
    let v = await findRepairByToken(db, reference, token);
    expect(v).toMatchObject({ status: "estimate_sent", estimateAmount: 4500, estimateIsConfirmed: false });
    await updateRepair(db, id, { to: "booked", estimateAmount: 4800, estimateIsConfirmed: true }, "s");
    v = await findRepairByToken(db, reference, token);
    expect(v).toMatchObject({ status: "booked", estimateAmount: 4800, estimateIsConfirmed: true });
    expect(v?.history.map((h) => h.status)).toEqual(["new", "reviewing", "estimate_sent", "booked"]);
    expect((await db.query("select 1 from notification_outbox where dedupe_key like 'repair_status:%'")).length).toBeGreaterThanOrEqual(3);
  });

  it("rejects absurd amounts", async () => {
    const { reference } = await createRepairInquiry(db, input);
    await expect(updateRepair(db, await idOf(reference), { estimateAmount: -1 }, "s")).rejects.toBeInstanceOf(RepairError);
  });

  it("state machine: terminal states have no exits", () => {
    expect(canRepairTransition("completed", "new")).toBe(false);
    expect(canRepairTransition("new", "reviewing")).toBe(true);
  });
});
