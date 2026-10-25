export const REPAIR_STATUSES = [
  "new", "reviewing", "estimate_sent", "awaiting_customer", "booked", "in_repair", "ready", "completed", "declined", "cancelled",
] as const;
export type RepairStatus = (typeof REPAIR_STATUSES)[number];

const T: Record<RepairStatus, RepairStatus[]> = {
  new: ["reviewing", "declined", "cancelled"],
  reviewing: ["estimate_sent", "awaiting_customer", "declined", "cancelled"],
  estimate_sent: ["awaiting_customer", "booked", "declined", "cancelled"],
  awaiting_customer: ["estimate_sent", "booked", "declined", "cancelled"],
  booked: ["in_repair", "cancelled"],
  in_repair: ["ready", "declined"],
  ready: ["completed"],
  completed: [],
  declined: [],
  cancelled: [],
};

export const canRepairTransition = (from: RepairStatus, to: RepairStatus) => T[from].includes(to);
export const nextRepairStatuses = (from: RepairStatus) => [...T[from]];

/** Customer-facing wording. Deliberately avoids promising outcomes, prices or timings. */
export const REPAIR_LABEL: Record<RepairStatus, string> = {
  new: "Received",
  reviewing: "Being reviewed by our team",
  estimate_sent: "Estimate shared with you",
  awaiting_customer: "Waiting for your reply",
  booked: "Booked in",
  in_repair: "Repair in progress",
  ready: "Ready for collection",
  completed: "Completed",
  declined: "We could not take this repair",
  cancelled: "Cancelled",
};
