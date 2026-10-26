"use client";

import { useRef, useState } from "react";
import { uploadTicketAction } from "@/app/admin/(panel)/products/upload-actions";

const MAX_BYTES = 10 * 1024 * 1024;
const OK_TYPES = ["image/jpeg", "image/png", "image/webp"];
const natural = (a: File, b: File) => a.name.localeCompare(b.name, undefined, { numeric: true });

/**
 * Uploads photos straight from the browser to Cloudinary using a short-lived signed ticket from the server, then writes the
 * resulting https links into the text box named by `targetId` (the form still saves them like pasted links). For turntable
 * frames the files are put in filename order, so name them 01, 02, 03 … in the order the product turned.
 */
export function ImageUploader({ targetId, kind, enabled, label }: { targetId: string; kind: "photo" | "spin"; enabled: boolean; label: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<{ text: string; bad?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!enabled) {
    return <p className="text-xs text-muted">Photo upload is not switched on for this server yet (it needs a Cloudinary account). You can paste https links below.</p>;
  }

  async function run(files: File[]) {
    const chosen = files.sort(natural);
    const bad = chosen.find((f) => !OK_TYPES.includes(f.type) || f.size > MAX_BYTES);
    if (bad) { setStatus({ text: `“${bad.name}” is not a JPG, PNG or WebP under 10 MB. Nothing was uploaded.`, bad: true }); return; }
    setBusy(true);
    const urls: string[] = [];
    try {
      for (const [i, f] of chosen.entries()) {
        setStatus({ text: `Uploading ${i + 1} of ${chosen.length}…` });
        const t = await uploadTicketAction(kind); // a fresh ticket each time: they expire in minutes
        if (!t.ticket) throw new Error(t.error ?? "Could not start the upload.");
        const body = new FormData();
        for (const [k, v] of Object.entries(t.ticket.fields)) body.append(k, v);
        body.append("file", f);
        const res = await fetch(t.ticket.url, { method: "POST", body });
        const json = (await res.json().catch(() => ({}))) as { secure_url?: string; error?: { message?: string } };
        if (!res.ok || !json.secure_url) throw new Error(json.error?.message ?? `Upload of “${f.name}” failed.`);
        urls.push(json.secure_url);
      }
      const box = document.getElementById(targetId) as HTMLTextAreaElement | null;
      if (box) {
        const lines = kind === "photo" ? urls.map((u) => `${u}|`).join("\n") : urls.join("\n");
        box.value = box.value.trim() ? `${box.value.trimEnd()}\n${lines}` : lines;
        box.dispatchEvent(new Event("input", { bubbles: true }));
      }
      setStatus({ text: `Added ${urls.length} ${urls.length === 1 ? "photo" : "photos"}. Remember to press Save product.${kind === "photo" ? " Add a short description after each | if you like." : ""}` });
    } catch (e) {
      const added = urls.length ? ` ${urls.length} uploaded before the problem, but none were added: please try again.` : "";
      setStatus({ text: `${e instanceof Error ? e.message : "Upload failed."}${added}`, bad: true });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" id={`${targetId}-file`} aria-label={label}
        onChange={(e) => { const f = [...(e.target.files ?? [])]; if (f.length) void run(f); }} />
      <button type="button" disabled={busy} onClick={() => input.current?.click()} className="btn btn-ti !min-h-11">{busy ? "Uploading…" : label}</button>
      {status && <p role={status.bad ? "alert" : "status"} className={`text-sm font-semibold ${status.bad ? "text-danger" : "text-ok"}`}>{status.text}</p>}
    </div>
  );
}
