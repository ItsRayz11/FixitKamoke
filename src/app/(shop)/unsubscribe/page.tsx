import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/db";
import { unsubscribe } from "@/lib/marketing";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false, follow: false } };

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const done = token ? await unsubscribe(await getDb(), token) : false;
  return (
    <div className="container-x max-w-xl py-14 text-center">
      <h1 className="text-2xl font-extrabold">{done ? "You have been unsubscribed" : "We could not find that subscription"}</h1>
      <p className="mt-3 text-muted">{done ? "You will not get marketing emails from us. You will still get emails about orders and repairs you ask for." : "The link may be incomplete or already used."}</p>
      <p className="mt-5"><Link href="/" className="font-semibold text-accent underline">Back to the shop</Link></p>
    </div>
  );
}
