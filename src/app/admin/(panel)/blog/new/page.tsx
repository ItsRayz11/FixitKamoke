import { requireAdmin } from "@/lib/auth/session";
import { Banner } from "@/components/admin/ui";
import { PostForm } from "@/components/admin/post-form";

export const dynamic = "force-dynamic";

export default async function NewPost({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireAdmin("manager");
  const sp = await searchParams;
  return (
    <div>
      <h1 className="mb-4 text-2xl font-extrabold">New article</h1>
      <Banner error={sp.error} />
      <PostForm post={null} />
    </div>
  );
}
