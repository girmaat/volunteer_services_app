import { PageHeader } from "../../../../components/ui";
import FindOpportunities from "../../../../components/opportunities/FindOpportunities";
import { getCategories } from "../../../../lib/requests";

export const dynamic = "force-dynamic";

export default async function Page(props: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = (await props.searchParams) || {};
  const categories = await getCategories();
  return (
    <>
      <PageHeader title="Near you" description="In-person opportunities within your travel radius." />
      <FindOpportunities sp={sp} tab="nearby" basePath="/volunteer/opportunities/nearby" detailBase="/volunteer/opportunities" personalized categories={categories} />
    </>
  );
}
