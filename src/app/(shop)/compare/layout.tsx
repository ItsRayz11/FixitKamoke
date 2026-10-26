import type { Metadata } from "next";

// A personal, per-browser list: kept out of search results.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
