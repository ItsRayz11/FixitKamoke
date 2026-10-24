import { assertRupees } from "./money";

export interface ShippingZone {
  id: string;
  label: string;
  cities: string[];
  fee: number;
  freeThreshold: number | null;
  codAvailable: boolean;
  etaDays: [number, number] | null;
}

export interface ShippingConfig {
  version: string;
  zones: ShippingZone[];
  /** Cities with no zone: owner must confirm the rate manually. */
  unlistedCity: "manual_confirmation" | "not_serviceable";
}

export type ShippingQuote =
  | { status: "quoted"; zoneId: string; fee: number; codAvailable: boolean; etaDays: [number, number] | null; version: string }
  | { status: "needs_confirmation"; version: string }
  | { status: "not_serviceable"; version: string };

export const normalizeCity = (c: string) => c.trim().toLowerCase().replace(/\s+/g, " ");

export function quoteShipping(config: ShippingConfig, city: string, subtotal: number): ShippingQuote {
  assertRupees(subtotal, "subtotal");
  const key = normalizeCity(city);
  const zone = config.zones.find((z) => z.cities.some((c) => normalizeCity(c) === key));
  if (!zone) {
    return { status: config.unlistedCity === "manual_confirmation" ? "needs_confirmation" : "not_serviceable", version: config.version };
  }
  const free = zone.freeThreshold !== null && subtotal >= zone.freeThreshold;
  return {
    status: "quoted",
    zoneId: zone.id,
    fee: free ? 0 : assertRupees(zone.fee, "shipping fee"),
    codAvailable: zone.codAvailable,
    etaDays: zone.etaDays,
    version: config.version,
  };
}
