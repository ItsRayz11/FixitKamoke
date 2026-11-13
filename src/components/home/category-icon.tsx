/** A simple icon for a shop category, chosen from words in its name or address. Falls back to a neutral tile. No claims, just wayfinding. */
const SHAPES: { test: RegExp; d: string }[] = [
  { test: /charg|cable|adapter|plug|usb/i, d: "M9 3v5M15 3v5M7 8h10v3a5 5 0 0 1-10 0zM12 16v5" },
  { test: /case|cover|protect|glass|screen/i, d: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" },
  { test: /audio|ear|head|speaker|sound|buds/i, d: "M4 14v-2a8 8 0 0 1 16 0v2M4 14h3v6H5a1 1 0 0 1-1-1zM20 14h-3v6h2a1 1 0 0 0 1-1z" },
  { test: /power|bank|battery/i, d: "M5 8h12v10H5zM17 11h2v4h-2zM9 11l2 2-2 2" },
  { test: /watch|band|wear/i, d: "M9 3h6l1 4H8zM9 21h6l1-4H8zM8 7h8v10H8z" },
  { test: /holder|stand|mount|car/i, d: "M8 3h8a1 1 0 0 1 1 1v12H7V4a1 1 0 0 1 1-1zM5 21h14M12 16v5" },
];
const FALLBACK = "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z";

export function CategoryIcon({ name, slug }: { name: string; slug: string }) {
  const d = SHAPES.find((s) => s.test.test(`${name} ${slug}`))?.d ?? FALLBACK;
  return (
    <svg aria-hidden="true" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="text-accent"><path d={d} /></svg>
  );
}
