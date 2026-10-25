import { KeepForm } from "./keep-form";
import { Field, inputCls, Submit } from "./ui";
import { savePostAction } from "@/app/admin/(panel)/blog/actions";
import type { Post } from "@/lib/blog";

export function PostForm({ post }: { post: Post | null }) {
  return (
    <KeepForm action={savePostAction} className="grid max-w-3xl gap-4">
      {post && <input type="hidden" name="id" value={post.id} />}
      {post?.needsReview && (
        <p role="note" className="rounded-[var(--radius-sm)] border border-amber-300 bg-amber-50 p-3 text-sm text-warn">
          This starter article has not been reviewed. Read every statement and change anything that is not right for your shop before publishing.
        </p>
      )}
      <Field label="Title" id="title"><input id="title" name="title" required defaultValue={post?.title ?? ""} className={inputCls} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Web address (slug)" id="slug" hint="Lowercase letters, numbers and dashes. Leave blank to build it from the title."><input id="slug" name="slug" defaultValue={post?.slug ?? ""} className={inputCls} /></Field>
        <Field label="Author" id="author"><input id="author" name="author" defaultValue={post?.author ?? "Fixit team"} className={inputCls} /></Field>
      </div>
      <Field label="Excerpt" id="excerpt" hint="One or two sentences shown in lists."><textarea id="excerpt" name="excerpt" rows={2} defaultValue={post?.excerpt ?? ""} className={`${inputCls} h-auto py-2`} /></Field>
      <Field label="Search description" id="metaDescription" hint="Up to 170 characters, shown in Google results."><input id="metaDescription" name="metaDescription" defaultValue={post?.metaDescription ?? ""} className={inputCls} /></Field>
      <Field label="Cover image URL" id="coverUrl" hint="Optional. https only. Use a real photo you have the right to use."><input id="coverUrl" name="coverUrl" type="url" defaultValue={post?.coverUrl ?? ""} className={inputCls} /></Field>
      <Field label="Article text" id="bodyMd" hint="Simple formatting: ## Heading, **bold**, *italic*, - bullet lists, 1. numbered lists, [link text](https://…). Only publish advice you know to be accurate.">
        <textarea id="bodyMd" name="bodyMd" rows={18} defaultValue={post?.bodyMd ?? ""} className={`${inputCls} h-auto py-2 font-mono`} />
      </Field>
      <Field label="Related products" id="productSlugs" hint="Product web addresses separated by commas. Shown as links under the article."><input id="productSlugs" name="productSlugs" defaultValue={(post?.productSlugs ?? []).join(", ")} className={inputCls} /></Field>
      <fieldset className="space-y-2 rounded-[var(--radius-md)] border border-line bg-surface p-4">
        <legend className="px-1 text-sm font-bold">Publishing</legend>
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input type="checkbox" name="publish" defaultChecked={post?.status === "published"} className="h-5 w-5" /> Published (visible to everyone)</label>
        {post?.needsReview && <label className="flex min-h-11 items-start gap-3 text-sm font-semibold"><input type="checkbox" name="reviewed" className="mt-0.5 h-5 w-5" /> I have read this article and confirm it is accurate for our shop.</label>}
      </fieldset>
      <div className="flex items-center gap-4">
        <Submit>Save article</Submit>
        {post?.status === "published" && <a href={`/blog/${post.slug}`} className="text-sm font-semibold text-accent underline" target="_blank" rel="noopener noreferrer">View live</a>}
      </div>
    </KeepForm>
  );
}
