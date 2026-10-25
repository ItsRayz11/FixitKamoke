"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { assertAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { flash, slugify } from "@/lib/admin/flash";
import { BlogError, importStarterArticles, postSchema, savePost } from "@/lib/blog";

const blank = (f: FormData, k: string) => { const v = String(f.get(k) ?? "").trim(); return v === "" ? null : v; };

export async function savePostAction(form: FormData) {
  const admin = await assertAdmin("manager");
  const id = String(form.get("id") ?? "") || null;
  const back = id ? `/admin/blog/${id}` : "/admin/blog/new";
  const title = String(form.get("title") ?? "");
  const p = postSchema.safeParse({
    title, slug: String(form.get("slug") ?? "").trim() || slugify(title), excerpt: String(form.get("excerpt") ?? ""),
    metaDescription: blank(form, "metaDescription"), author: blank(form, "author"), coverUrl: blank(form, "coverUrl"),
    bodyMd: String(form.get("bodyMd") ?? ""),
    productSlugs: String(form.get("productSlugs") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    publish: form.get("publish") === "on", reviewed: form.get("reviewed") === "on",
  });
  if (!p.success) flash(back, { error: p.error.issues[0].message });
  let savedId: string;
  try {
    savedId = await savePost(await getDb(), id, p.data!);
  } catch (e) {
    if (e instanceof BlogError) flash(back, { error: e.message });
    throw e;
  }
  await audit(admin.email, p.data!.publish ? "post_published" : "post_saved", "blog_post", savedId, { slug: p.data!.slug });
  revalidatePath("/blog"); revalidatePath(`/blog/${p.data!.slug}`);
  flash(`/admin/blog/${savedId}`, { ok: p.data!.publish ? "Saved and published." : "Saved as draft." });
}

export async function importStarterAction() {
  const admin = await assertAdmin("manager");
  const n = await importStarterArticles(await getDb());
  await audit(admin.email, "starter_articles_imported", "blog_post", null, { added: n });
  flash("/admin/blog", { ok: n ? `Added ${n} starter guide${n === 1 ? "" : "s"} as drafts. Review each one before publishing.` : "The starter guides are already in your list." });
}
