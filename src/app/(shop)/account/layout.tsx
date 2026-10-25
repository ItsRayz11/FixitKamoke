import type { Metadata } from "next";

// Account pages are private: never indexed.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <div className="container-x max-w-4xl py-10">{children}</div>;
}
