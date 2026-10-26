export type Availability = "in_stock" | "low_stock" | "out_of_stock";
export const availability = (stock: number): Availability => (stock <= 0 ? "out_of_stock" : stock <= 3 ? "low_stock" : "in_stock");
