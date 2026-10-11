import ApplicantsView from "../../../../../components/requests/ApplicantsView";

export const dynamic = "force-dynamic";

export default async function Page(props: { params: Promise<{ id: string }>; searchParams?: Promise<{ flash?: string; error?: string }> }) {
  const { id } = await props.params;
  const sp = (await props.searchParams) || {};
  return <ApplicantsView requestId={id} base="/requester/requests" flash={sp.flash} error={sp.error} />;
}
