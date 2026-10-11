import { PageHeader } from "../../../../components/ui";
import FindOpportunities from "../../../../components/opportunities/FindOpportunities";
import { getCategories } from "../../../../lib/requests";

export const dynamic = "force-dynamic";

export default async function Page(props: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = (await props.searchParams) || {};
  const categories = await getCategories();
  return (
    <>
      <PageHeader title="Recommended for you" description="Ranked by your skills, causes, schedule and distance." />
      <FindOpportunities sp={sp} tab="recommended" basePath="/volunteer/opportunities/recommended" detailBase="/volunteer/opportunities" personalized categories={categories} />
    </>
  );
}
