export const ORDER_STATUSES = [
  "pending_confirmation", "confirmed", "processing", "shipped", "delivered",
  "cancelled", "rejected", "failed_delivery", "return_requested", "returned",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending_confirmation: ["confirmed", "cancelled", "rejected"],
  confirmed: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered", "failed_delivery"],
  failed_delivery: ["shipped", "cancelled"],
  delivered: ["return_requested"],
  return_requested: ["returned", "delivered"],
  cancelled: [],
  rejected: [],
  returned: [],
};

export const canTransition = (from: OrderStatus, to: OrderStatus) => TRANSITIONS[from].includes(to);
export const nextStatuses = (from: OrderStatus) => [...TRANSITIONS[from]];
/** Statuses where reserved stock must go back to inventory. */
export const RESTOCKS_ON: OrderStatus[] = ["cancelled", "rejected"];
