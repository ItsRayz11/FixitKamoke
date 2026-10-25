"use client";

import Link from "next/link";

// Never show error details to visitors. The digest lets the owner match a report to a server log line.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-4 text-center">
      <h1 className="text-3xl font-extrabold">Something went wrong</h1>
      <p className="mt-3 text-muted">Sorry, that did not work. Nothing you entered has been charged. You can try again, or go back to the shop.</p>
      {error.digest && <p className="mt-2 text-xs text-muted">Reference: {error.digest}</p>}
      <div className="mt-6 flex gap-3 text-sm font-semibold">
        <button onClick={reset} className="min-h-11 rounded-[var(--radius-sm)] bg-accent px-5 text-white">Try again</button>
        <Link href="/" className="inline-flex min-h-11 items-center rounded-[var(--radius-sm)] border border-line px-5">Home</Link>
      </div>
    </div>
  );
}
