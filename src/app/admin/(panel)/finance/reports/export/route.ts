import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { getDb } from "@/lib/db";
import { toCsv, toExcelXml } from "@/lib/finance/export";
import { can } from "@/lib/finance/perms";
import { permsFor } from "@/lib/finance/perms-core";
import { REPORTS } from "@/lib/finance/report-defs";
import { monthRange } from "@/lib/finance/reports";

export const dynamic = "force-dynamic";

/** Report download. Same permission check as the report page: signed-in, and the report's own finance permission. */
export async function GET(req: Request) {
  const admin = await getAdmin();
  if (!admin) return new NextResponse("Not signed in", { status: 401 });
  const db = await getDb();
  const granted = (await db.query<{ finance_perms: string[] }>("select finance_perms from admin_users where id = $1 and active", [admin.id]))[0]?.finance_perms ?? [];
  const me = { role: admin.role, perms: permsFor(admin.role, granted) };
  const u = new URL(req.url);
  const def = REPORTS[u.searchParams.get("report") ?? ""];
  if (!def || !can(me, def.perm)) return new NextResponse("Not allowed", { status: 403 });
  const month = await monthRange(db);
  const ok = (v: string | null, d: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : d);
  const from = ok(u.searchParams.get("from"), month.from); const to = ok(u.searchParams.get("to"), month.to);
  const account = (u.searchParams.get("account") ?? "1000").replace(/[^0-9a-f-]/gi, "").slice(0, 40) || "1000";
  const data = await def.build(db, from, to, account);
  await audit(admin.email, "finance_report_exported", "report", null, { report: u.searchParams.get("report"), from, to });
  const base = `fixit-${(u.searchParams.get("report") ?? "report")}-${from}_to_${to}`;
  const xls = u.searchParams.get("format") === "xls";
  return new NextResponse(xls ? toExcelXml(data.title, data.rows, data.cols) : toCsv(data.rows, data.cols), {
    headers: {
      "Content-Type": xls ? "application/vnd.ms-excel; charset=utf-8" : "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${base}.${xls ? "xml" : "csv"}"`,
      "Cache-Control": "no-store",
    },
  });
}
