import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getPostById } from "@/lib/blog";
import { Banner } from "@/components/admin/ui";
import { PostForm } from "@/components/admin/post-form";

export const dynamic = "force-dynamic";

export default async function EditPost({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireAdmin("manager");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const post = await getPostById(await getDb(), id);
  if (!post) notFound();
  return (
    <div>
      <h1 className="mb-4 text-2xl font-extrabold">Edit article</h1>
      <Banner ok={sp.ok} error={sp.error} />
      <PostForm post={post} />
    </div>
  );
}
