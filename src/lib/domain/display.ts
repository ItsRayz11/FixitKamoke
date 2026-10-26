/** Name shown in carts, orders and confirmations: the base name plus the chosen finish, e.g. "Braided cable — Black". */
export const displayName = (name: string, label: string | null | undefined) => (label ? `${name} — ${label}` : name);
