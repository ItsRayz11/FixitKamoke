/**
 * Normalises Pakistani mobile numbers to E.164 (+923XXXXXXXXX).
 * Accepts 03XX-XXXXXXX, 3XXXXXXXXX, 923XXXXXXXXX, +92 3XX XXXXXXX, 0092 3XX ...
 * Returns null when the input cannot be a Pakistani mobile number.
 */
export function normalizePkMobile(input: string): string | null {
  if (typeof input !== "string") return null;
  let d = input.replace(/[\s\-().]/g, "");
  if (!/^\+?\d+$/.test(d)) return null;
  d = d.replace(/^\+/, "");
  if (d.startsWith("0092")) d = d.slice(4);
  else if (d.startsWith("92")) d = d.slice(2);
  else if (d.startsWith("0")) d = d.slice(1);
  return /^3\d{9}$/.test(d) ? `+92${d}` : null;
}
