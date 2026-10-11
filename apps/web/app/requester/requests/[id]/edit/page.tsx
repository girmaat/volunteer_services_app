import { redirect } from "next/navigation";

/** Editing reuses the posting wizard. */
export default async function Page(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  redirect(`/requester/requests/new?id=${encodeURIComponent(id)}&step=1`);
}
