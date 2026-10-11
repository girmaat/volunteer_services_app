import { PageHeader } from "../../../../components/ui";
import FindOpportunities from "../../../../components/opportunities/FindOpportunities";
import { getCategories } from "../../../../lib/requests";

export const dynamic = "force-dynamic";

export default async function Page(props: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = (await props.searchParams) || {};
  const categories = await getCategories();
  return (
    <>
      <PageHeader title="Remote opportunities" description="Help from anywhere by phone or video." />
      <FindOpportunities sp={sp} tab="remote" basePath="/volunteer/opportunities/remote" detailBase="/volunteer/opportunities" personalized categories={categories} />
    </>
  );
}
