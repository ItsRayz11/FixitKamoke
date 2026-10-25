import type { Metadata } from "next";

export const metadata: Metadata = { title: "Back soon", robots: { index: false, follow: false } };

export default function MaintenancePage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-4 text-center">
      <p className="text-2xl font-extrabold">Fix<span className="text-cyan">it</span></p>
      <h1 className="mt-4 text-3xl font-extrabold">We are making some improvements</h1>
      <p className="mt-3 text-muted">The shop is briefly unavailable. Please check back soon. Orders and repair requests you already sent are safe.</p>
    </div>
  );
}
