import { z } from "zod";
import { getDb } from "@/lib/db";
import type { Db } from "@/lib/db";
import { STARTER_ARTICLES } from "@/content/starter-articles";

export interface Post {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  bodyMd: string;
  author: string | null;
  status: "draft" | "published";
  publishedAt: string | null;
  updatedAt: string;
  coverUrl: string | null;
  metaDescription: string | null;
  productSlugs: string[];
  needsReview: boolean;
}

interface Row {
  id: string; slug: string; title: string; excerpt: string; body_md: string; author: string | null; status: "draft" | "published";
  published_at: Date | string | null; updated_at: Date | string; cover_url: string | null; meta_description: string | null; product_slugs: string[]; needs_review: boolean;
}

const iso = (d: Date | string | null) => (d ? new Date(d).toISOString() : null);
const map = (r: Row): Post => ({
  id: r.id, slug: r.slug, title: r.title, excerpt: r.excerpt, bodyMd: r.body_md, author: r.author, status: r.status, publishedAt: iso(r.published_at),
  updatedAt: iso(r.updated_at)!, coverUrl: r.cover_url, metaDescription: r.meta_description, productSlugs: r.product_slugs ?? [], needsReview: r.needs_review,
});

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const postSchema = z.object({
  title: z.string().trim().min(3, "Title is required").max(160),
  slug: z.string().trim().min(3, "Web address is required").max(100).regex(SLUG_RE, "Web address can only use lowercase letters, numbers and dashes"),
  excerpt: z.string().trim().max(400),
  metaDescription: z.string().trim().max(170, "Search description should be 170 characters or fewer").nullable(),
  author: z.string().trim().max(80).nullable(),
  coverUrl: z.string().trim().url("Cover image must be a full https:// address").refine((u) => u.startsWith("https://"), "Cover image must use https").nullable(),
  bodyMd: z.string().max(60_000),
  productSlugs: z.array(z.string().trim().regex(SLUG_RE)).max(8),
  publish: z.boolean(),
  reviewed: z.boolean(),
});
export type PostInput = z.infer<typeof postSchema>;

const COLS = "id, slug, title, excerpt, body_md, author, status, published_at, updated_at, cover_url, meta_description, product_slugs, needs_review";

export async function listPublishedPosts(limit = 50): Promise<Post[]> {
  return (await (await getDb()).query<Row>(`select ${COLS} from blog_posts where status = 'published' order by published_at desc limit $1`, [limit])).map(map);
}

export async function getPublishedPost(slug: string): Promise<Post | null> {
  const r = await (await getDb()).query<Row>(`select ${COLS} from blog_posts where status = 'published' and slug = $1`, [slug]);
  return r[0] ? map(r[0]) : null;
}

export async function relatedPosts(post: Post, limit = 3): Promise<Post[]> {
  return (await (await getDb()).query<Row>(`select ${COLS} from blog_posts where status = 'published' and id <> $1 order by published_at desc limit $2`, [post.id, limit])).map(map);
}

/** Guides that recommend this product (owner-tagged), topped up with the newest guides so the buying-advice block is never empty when guides exist. */
export async function postsForProduct(productSlug: string, limit = 2): Promise<Post[]> {
  const db = await getDb();
  const tagged = (await db.query<Row>(`select ${COLS} from blog_posts where status = 'published' and $1 = any(product_slugs) order by published_at desc limit $2`, [productSlug, limit])).map(map);
  if (tagged.length >= limit) return tagged;
  const more = (await db.query<Row>(`select ${COLS} from blog_posts where status = 'published' and not ($1 = any(product_slugs)) order by published_at desc limit $2`, [productSlug, limit - tagged.length])).map(map);
  return [...tagged, ...more];
}

export async function listAllPosts(db: Db): Promise<Post[]> {
  return (await db.query<Row>(`select ${COLS} from blog_posts order by (status = 'draft') desc, updated_at desc`)).map(map);
}

export async function getPostById(db: Db, id: string): Promise<Post | null> {
  const r = await db.query<Row>(`select ${COLS} from blog_posts where id = $1`, [id]);
  return r[0] ? map(r[0]) : null;
}

export class BlogError extends Error {}

/** Create or update. Publishing a post flagged "needs review" requires the reviewer's confirmation. */
export async function savePost(db: Db, id: string | null, input: PostInput): Promise<string> {
  return db.tx(async (q) => {
    let needsReview = false;
    if (id) {
      const cur = await q.query<{ needs_review: boolean }>("select needs_review from blog_posts where id = $1 for update", [id]);
      if (!cur[0]) throw new BlogError("Post not found.");
      needsReview = cur[0].needs_review;
    }
    if (input.publish && needsReview && !input.reviewed) {
      throw new BlogError("This starter article has not been reviewed yet. Read it carefully, then tick the confirmation box to publish.");
    }
    if (input.publish && (!input.excerpt || input.bodyMd.trim().length < 200)) {
      throw new BlogError("Add an excerpt and at least a few paragraphs before publishing.");
    }
    const status = input.publish ? "published" : "draft";
    const stillNeedsReview = input.publish ? false : needsReview;
    try {
      if (id) {
        await q.query(
          `update blog_posts set slug=$2, title=$3, excerpt=$4, body_md=$5, author=$6, status=$7, cover_url=$8, meta_description=$9, product_slugs=$10, needs_review=$11,
             published_at = case when $7 = 'published' then coalesce(published_at, now()) else published_at end, updated_at = now() where id = $1`,
          [id, input.slug, input.title, input.excerpt, input.bodyMd, input.author, status, input.coverUrl, input.metaDescription, input.productSlugs, stillNeedsReview]);
        return id;
      }
      const r = await q.query<{ id: string }>(
        `insert into blog_posts(slug, title, excerpt, body_md, author, status, cover_url, meta_description, product_slugs, needs_review, published_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,false, case when $6 = 'published' then now() end) returning id`,
        [input.slug, input.title, input.excerpt, input.bodyMd, input.author, status, input.coverUrl, input.metaDescription, input.productSlugs]);
      return r[0].id;
    } catch (e) {
      if (/duplicate key/.test(String(e))) throw new BlogError("Another post already uses that web address.");
      throw e;
    }
  });
}

/** Inserts the four starter guides as drafts that need review. Existing slugs are left untouched. */
export async function importStarterArticles(db: Db): Promise<number> {
  let n = 0;
  for (const a of STARTER_ARTICLES) {
    const r = await db.query(
      `insert into blog_posts(slug, title, excerpt, body_md, author, status, meta_description, needs_review)
       values ($1,$2,$3,$4,'Fixit team','draft',$5,true) on conflict (slug) do nothing returning id`,
      [a.slug, a.title, a.excerpt, a.body.trim(), a.metaDescription]);
    n += r.length;
  }
  return n;
}
