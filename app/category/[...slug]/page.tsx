import { redirect } from "next/navigation";

export default async function CategoryRedirect({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  redirect(`/search?category=${slug[slug.length - 1]}`);
}
