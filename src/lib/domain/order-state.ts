export const ORDER_STATUSES = [
  "pending_confirmation", "confirmed", "processing", "packed", "shipped", "out_for_delivery", "delivered",
  "cancelled", "rejected", "failed_delivery", "return_requested", "returned",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * Fulfilment stages. "Packed" and "Out for delivery" are optional steps: a shop that does not use them can still go
 * Being prepared -> Shipped -> Delivered. Payment is tracked separately (orders.payment_status), so a stage never means "paid".
 */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending_confirmation: ["confirmed", "cancelled", "rejected"],
  confirmed: ["processing", "cancelled"],
  processing: ["packed", "shipped", "cancelled"],
  packed: ["shipped", "cancelled"],
  shipped: ["out_for_delivery", "delivered", "failed_delivery"],
  out_for_delivery: ["delivered", "failed_delivery"],
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
/** Statuses from which a customer may no longer be asked to pay or have an advance verified. */
export const CLOSED: OrderStatus[] = ["cancelled", "rejected", "returned"];
