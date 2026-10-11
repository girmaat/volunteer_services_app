import OwnerRequestList from "../../../components/requests/OwnerRequestList";
import { getOrgContext } from "../../lib/org";

export const dynamic = "force-dynamic";

export default async function Page(props: { searchParams?: Promise<{ tab?: string }> }) {
  const sp = (await props.searchParams) || {};
  const ctx = await getOrgContext();
  return (
    <OwnerRequestList
      as="org"
      base="/org/requests"
      tab={sp.tab}
      title="Requests"
      description={`Shifts and projects posted by ${ctx?.org.name ?? "your organization"}.`}
      canPost={ctx?.membership.role !== "member"}
    />
  );
}
