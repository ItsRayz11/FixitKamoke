import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/lib/db";
import { migrate } from "@/lib/db/migrate";
import { BlogError, importStarterArticles, postSchema, savePost, type PostInput } from "@/lib/blog";
import { STARTER_ARTICLES } from "@/content/starter-articles";

let db: Db;
const longBody = "A paragraph of real content. ".repeat(20);
const input = (o: Partial<PostInput> = {}): PostInput => ({
  title: "A test article", slug: "a-test-article", excerpt: "Short excerpt", metaDescription: null, author: "Fixit team", coverUrl: null,
  bodyMd: longBody, productSlugs: [], publish: false, reviewed: false, ...o,
});

beforeAll(async () => { db = await createPgliteDb(); await migrate(db); });
afterAll(() => db.close());

describe("blog", () => {
  it("imports the starter guides once, as unreviewed drafts", async () => {
    expect(await importStarterArticles(db)).toBe(STARTER_ARTICLES.length);
    expect(await importStarterArticles(db)).toBe(0);
    const rows = await db.query<{ status: string; needs_review: boolean }>("select status, needs_review from blog_posts");
    expect(rows.every((r) => r.status === "draft" && r.needs_review)).toBe(true);
  });

  it("will not publish an unreviewed starter article without confirmation", async () => {
    const id = (await db.query<{ id: string }>("select id from blog_posts limit 1"))[0].id;
    const cur = (await db.query<{ slug: string; title: string; excerpt: string; body_md: string }>("select slug, title, excerpt, body_md from blog_posts where id=$1", [id]))[0];
    const base = input({ slug: cur.slug, title: cur.title, excerpt: cur.excerpt, bodyMd: cur.body_md, publish: true });
    await expect(savePost(db, id, base)).rejects.toBeInstanceOf(BlogError);
    expect((await db.query<{ status: string }>("select status from blog_posts where id=$1", [id]))[0].status).toBe("draft");
    await savePost(db, id, { ...base, reviewed: true });
    const after = (await db.query<{ status: string; needs_review: boolean; published_at: string | null }>("select status, needs_review, published_at from blog_posts where id=$1", [id]))[0];
    expect(after.status).toBe("published");
    expect(after.needs_review).toBe(false);
    expect(after.published_at).not.toBeNull();
  });

  it("keeps the original publish date when an article is edited later", async () => {
    const id = await savePost(db, null, input({ slug: "dated-post", publish: true }));
    const first = (await db.query<{ published_at: Date }>("select published_at from blog_posts where id=$1", [id]))[0].published_at;
    await new Promise((r) => setTimeout(r, 15));
    await savePost(db, id, input({ slug: "dated-post", title: "Edited title", publish: true }));
    const second = (await db.query<{ published_at: Date }>("select published_at from blog_posts where id=$1", [id]))[0].published_at;
    expect(new Date(second).getTime()).toBe(new Date(first).getTime());
  });

  it("refuses to publish thin content and duplicate web addresses", async () => {
    await expect(savePost(db, null, input({ slug: "thin", bodyMd: "too short", publish: true }))).rejects.toBeInstanceOf(BlogError);
    await savePost(db, null, input({ slug: "unique-one" }));
    await expect(savePost(db, null, input({ slug: "unique-one" }))).rejects.toThrow(/already uses that web address/);
  });

  it("validates slugs, cover URLs and description length", () => {
    expect(postSchema.safeParse({ ...input(), slug: "Bad Slug!" }).success).toBe(false);
    expect(postSchema.safeParse({ ...input(), coverUrl: "http://insecure.example/a.jpg" }).success).toBe(false);
    expect(postSchema.safeParse({ ...input(), coverUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(postSchema.safeParse({ ...input(), metaDescription: "x".repeat(171) }).success).toBe(false);
    expect(postSchema.safeParse(input()).success).toBe(true);
  });
});
