import OwnerRequestList from "../../../components/requests/OwnerRequestList";

export const dynamic = "force-dynamic";

export default async function Page(props: { searchParams?: Promise<{ tab?: string }> }) {
  const sp = (await props.searchParams) || {};
  return <OwnerRequestList as="requester" base="/requester/requests" tab={sp.tab} title="My requests" description="Drafts, live requests and past ones." />;
}
