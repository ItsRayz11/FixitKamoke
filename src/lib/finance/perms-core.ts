/** Pure permission rules (no framework imports) so they can be unit-tested. */
export const FINANCE_PERMS = ["finance_view", "finance_costs", "finance_write", "finance_close", "pos"] as const;
export type FinancePerm = (typeof FINANCE_PERMS)[number];
export const PERM_LABEL: Record<FinancePerm, string> = {
  finance_view: "See finance overview and balances",
  finance_costs: "See costs and profit",
  finance_write: "Record purchases, expenses, suppliers, accounts",
  finance_close: "Close the day",
  pos: "Use the shop counter",
};

export const permsFor = (role: string, granted: string[]): FinancePerm[] =>
  role === "owner" ? [...FINANCE_PERMS] : [...new Set([...(role === "staff" ? ["pos"] : []), ...granted])].filter((p): p is FinancePerm => (FINANCE_PERMS as readonly string[]).includes(p));

export const can = (u: { role: string; perms: FinancePerm[] }, perm: FinancePerm) => u.role === "owner" || u.perms.includes(perm);

