import type { Metadata } from "next";

// Private, transactional page: kept out of search results.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
