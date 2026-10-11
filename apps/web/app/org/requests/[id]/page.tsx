import { notFound } from "next/navigation";
import OwnerRequestView from "../../../../components/requests/OwnerRequestView";
import { getCategories, getOwnerRequest } from "../../../../lib/requests";

export const dynamic = "force-dynamic";

export default async function Page(props: { params: Promise<{ id: string }>; searchParams?: Promise<{ flash?: string; error?: string }> }) {
  const { id } = await props.params;
  const sp = (await props.searchParams) || {};
  const [r, categories] = await Promise.all([getOwnerRequest(id), getCategories()]);
  if (!r) notFound();
  return (
    <OwnerRequestView
      r={r}
      categories={categories}
      base="/org/requests"
      flash={sp.flash}
      error={sp.error}
      extraLinks={[
        { href: `/org/requests/${r.id}/documents`, label: "Documents and waivers" },
        { href: `/org/attendance?requestId=${r.id}`, label: "Attendance" },
        { href: `/org/incidents?requestId=${r.id}`, label: "Incidents" }
      ]}
    />
  );
}
