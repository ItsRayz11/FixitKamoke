export interface Col { key: string; label: string }
type Row = Record<string, unknown>;

/** A spreadsheet formula would run if a cell starts with one of these, so text that does is prefixed with an apostrophe. */
const guard = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

/** CSV that Excel opens correctly: UTF-8 with a byte-order mark. */
export function toCsv(rows: Row[], cols: Col[]): string {
  const cell = (v: unknown) => {
    if (v == null) return "";
    if (typeof v === "number") return String(v);
    const s = guard(String(v));
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [cols.map((c) => cell(c.label)).join(","), ...rows.map((r) => cols.map((c) => cell(r[c.key])).join(","))].join("\r\n") + "\r\n";
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Excel 2003 XML workbook (opens in Excel and LibreOffice with no extra library). Numbers stay numbers. */
export function toExcelXml(sheet: string, rows: Row[], cols: Col[]): string {
  const cell = (v: unknown) => {
    if (typeof v === "number" && Number.isFinite(v)) return `<Cell><Data ss:Type="Number">${v}</Data></Cell>`;
    if (v != null && v !== "" && typeof v !== "object" && /^-?\d+(\.\d+)?$/.test(String(v)) && !/^0\d/.test(String(v))) return `<Cell><Data ss:Type="Number">${String(v)}</Data></Cell>`;
    return `<Cell><Data ss:Type="String">${esc(v == null ? "" : guard(String(v)))}</Data></Cell>`;
  };
  const head = `<Row>${cols.map((c) => `<Cell><Data ss:Type="String">${esc(c.label)}</Data></Cell>`).join("")}</Row>`;
  const body = rows.map((r) => `<Row>${cols.map((c) => cell(r[c.key])).join("")}</Row>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="${esc(sheet.slice(0, 31))}"><Table>${head}${body}</Table></Worksheet></Workbook>`;
}
