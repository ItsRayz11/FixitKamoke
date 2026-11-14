"use client";

import { useRef, useState } from "react";

const OK_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_INPUT = 15 * 1024 * 1024;
const MAX_SIDE = 1600;

type Ticket = { url: string; fields: Record<string, string> };

/** Shrinks a photo in the browser (long side 1600 px, JPEG) so a phone picture of several MB uploads quickly on mobile data. */
async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bmp.width * scale)); canvas.height = Math.max(1, Math.round(bmp.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.82));
  if (!blob) throw new Error("no blob");
  return blob;
}

export interface PickedPhoto { url: string; name: string }
type Shown = PickedPhoto & { preview: string };

/**
 * Lets a customer choose up to `max` pictures. Each is shrunk, then sent straight from the browser to the image host with a
 * short-lived signed ticket from the server; only the resulting links are reported through `onChange`. The page decides what to do with them.
 */
export function PhotoPicker({ label, hint, max = 3, getTicket, onChange, inputId }: {
  label: string; hint?: string; max?: number; inputId: string;
  getTicket: () => Promise<{ ticket?: Ticket; error?: string }>;
  onChange: (photos: PickedPhoto[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<Shown[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; bad?: boolean } | null>(null);

  function publish(next: Shown[]) { setPhotos(next); onChange(next.map(({ url, name }) => ({ url, name }))); }

  async function run(files: File[]) {
    if (photos.length + files.length > max) { setStatus({ text: `You can add up to ${max} pictures.`, bad: true }); return; }
    const bad = files.find((f) => !OK_TYPES.includes(f.type) || f.size > MAX_INPUT);
    if (bad) { setStatus({ text: `“${bad.name}” is not a JPG, PNG or WebP picture under 15 MB.`, bad: true }); return; }
    setBusy(true);
    const added: Shown[] = [];
    try {
      for (const [i, f] of files.entries()) {
        setStatus({ text: `Uploading ${i + 1} of ${files.length}…` });
        const small = await shrink(f).catch(() => { throw new Error(`“${f.name}” could not be read. Try a different picture.`); });
        const t = await getTicket();
        if (!t.ticket) throw new Error(t.error ?? "Could not start the upload.");
        const body = new FormData();
        for (const [k, v] of Object.entries(t.ticket.fields)) body.append(k, v);
        body.append("file", small, "photo.jpg");
        const res = await fetch(t.ticket.url, { method: "POST", body });
        const json = (await res.json().catch(() => ({}))) as { secure_url?: string; error?: { message?: string } };
        if (!res.ok || !json.secure_url) throw new Error(json.error?.message ?? `Upload of “${f.name}” failed.`);
        added.push({ url: json.secure_url, name: f.name, preview: URL.createObjectURL(small) });
      }
      publish([...photos, ...added]);
      setStatus({ text: `${added.length === 1 ? "Picture" : "Pictures"} added.` });
    } catch (e) {
      added.forEach((a) => URL.revokeObjectURL(a.preview));
      setStatus({ text: e instanceof Error ? e.message : "Upload failed. Please try again.", bad: true });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  function remove(i: number) { URL.revokeObjectURL(photos[i].preview); publish(photos.filter((_, j) => j !== i)); setStatus(null); }

  return (
    <div>
      <p className="font-semibold" id={`${inputId}-label`}>{label}</p>
      {hint && <p className="text-sm text-muted">{hint}</p>}
      <input ref={input} type="file" id={inputId} accept="image/jpeg,image/png,image/webp" multiple className="sr-only" aria-labelledby={`${inputId}-label`}
        onChange={(e) => { const f = [...(e.target.files ?? [])]; if (f.length) void run(f); }} />
      {photos.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-3">
          {photos.map((p, i) => (
            <li key={p.url} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.preview} alt={`Picture ${i + 1}: ${p.name}`} width={80} height={80} className="h-20 w-20 rounded-[var(--radius-sm)] border border-line object-cover" />
              <button type="button" onClick={() => remove(i)} aria-label={`Remove picture ${i + 1}`} className="absolute -right-2 -top-2 grid h-8 w-8 place-items-center rounded-full border border-line bg-surface text-lg leading-none shadow">×</button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy || photos.length >= max} onClick={() => input.current?.click()} className="btn btn-ti !min-h-11">{busy ? "Uploading…" : photos.length ? "Add another picture" : "Choose picture"}</button>
        {status && <p role={status.bad ? "alert" : "status"} className={`text-sm font-semibold ${status.bad ? "text-danger" : "text-ok"}`}>{status.text}</p>}
      </div>
    </div>
  );
}
