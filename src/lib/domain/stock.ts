/** At or below this many left, a product counts as "low": shown on the dashboard and the staff are emailed once. */
export const LOW_STOCK = 3;

/** True when an order took the stock from above the threshold to at or below it, so exactly one alert is sent per crossing. */
export const crossedIntoLow = (before: number, after: number) => before > LOW_STOCK && after <= LOW_STOCK;
