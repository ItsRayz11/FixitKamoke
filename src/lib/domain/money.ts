/** PKR amounts are always whole rupees stored as integers. */
export function assertRupees(n: number, label = "amount"): number {
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new RangeError(`${label} must be a non-negative integer number of rupees`);
  }
  return n;
}

export function formatPKR(n: number): string {
  assertRupees(n);
  return `Rs. ${n.toLocaleString("en-PK")}`;
}
