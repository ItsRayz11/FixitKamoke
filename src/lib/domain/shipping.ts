import { assertRupees } from "./money";

export interface ShippingZone {
  id: string;
  label: string;
  cities: string[];
  fee: number;
  freeThreshold: number | null;
  codAvailable: boolean;
  etaDays: [number, number] | null;
  /** False = the zone is switched off and its cities are treated as unlisted. Missing means on. */
  active?: boolean;
  /** False = no cash-on-delivery advance is asked for orders to this zone. Missing means follow the store rule. */
  advance?: boolean;
}

export interface ShippingConfig {
  version: string;
  zones: ShippingZone[];
  /** Cities with no zone: owner must confirm the rate manually. */
  unlistedCity: "manual_confirmation" | "not_serviceable";
}

export type ShippingQuote =
  | { status: "quoted"; zoneId: string; fee: number; codAvailable: boolean; etaDays: [number, number] | null; advanceApplies: boolean; version: string }
  | { status: "needs_confirmation"; version: string }
  | { status: "not_serviceable"; version: string };

export const normalizeCity = (c: string) => c.trim().toLowerCase().replace(/\s+/g, " ");

export function quoteShipping(config: ShippingConfig, city: string, subtotal: number): ShippingQuote {
  assertRupees(subtotal, "subtotal");
  const key = normalizeCity(city);
  const zone = config.zones.find((z) => z.active !== false && z.cities.some((c) => normalizeCity(c) === key));
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
    advanceApplies: zone.advance !== false,
    version: config.version,
  };
}

/**
 * Checks a set of zones before they are saved. Returns a plain sentence for the owner, or null when the rules are consistent.
 * The same city in two active zones would make the fee depend on zone order, so it is refused.
 */
export function zoneProblems(zones: ShippingZone[]): string | null {
  const seenLabels = new Set<string>();
  const owner = new Map<string, string>();
  for (const z of zones) {
    const label = z.label.trim().toLowerCase();
    if (seenLabels.has(label)) return `Two zones are both called "${z.label}". Give each zone its own name.`;
    seenLabels.add(label);
    if (z.etaDays && z.etaDays[0] > z.etaDays[1]) return `${z.label}: the delivery time starts at ${z.etaDays[0]} days but ends at ${z.etaDays[1]}. The first number must not be larger.`;
    if (z.freeThreshold !== null && z.freeThreshold <= 0) return `${z.label}: free delivery must start from an amount above Rs. 0, or be left empty.`;
    if (z.active === false) continue;
    for (const city of z.cities) {
      const k = normalizeCity(city);
      const prev = owner.get(k);
      if (prev && prev !== z.label) return `${city} is in both "${prev}" and "${z.label}". A city can only be in one active zone.`;
      owner.set(k, z.label);
    }
  }
  return null;
}
