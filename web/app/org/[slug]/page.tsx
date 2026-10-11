import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: { slug: string } }) {
  redirect(`/organizations/${encodeURIComponent(params.slug)}`);
}
