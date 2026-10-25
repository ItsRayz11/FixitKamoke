import { redirect } from "next/navigation";

/** Redirects back to a page with a one-shot message, so server actions can stay plain `<form action>` handlers. */
export function flash(path: string, msg: { ok?: string; error?: string }): never {
  const u = new URLSearchParams();
  if (msg.ok) u.set("ok", msg.ok);
  if (msg.error) u.set("error", msg.error);
  redirect(`${path}${path.includes("?") ? "&" : "?"}${u.toString()}`);
}

export const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 80);
