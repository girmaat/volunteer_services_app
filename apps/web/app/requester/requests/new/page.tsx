import { PageHeader } from "../../../../components/ui";
import RequestWizard from "../../../../components/requests/RequestWizard";
import { getCurrentUser } from "../../../lib/backend";
import { getCategories, getOwnerRequest } from "../../../../lib/requests";

export const dynamic = "force-dynamic";

type SP = { id?: string; step?: string; error?: string; saved?: string };

export default async function NewRequesterRequestPage(props: { searchParams?: Promise<SP> }) {
  const sp = (await props.searchParams) || {};
  const [user, categories, draft] = await Promise.all([getCurrentUser(), getCategories(), sp.id ? getOwnerRequest(sp.id) : Promise.resolve(null)]);
  const step = draft ? Math.min(5, Math.max(1, Number(sp.step) || 1)) : 1;
  return (
    <>
      <PageHeader
        title={draft?.status && draft.status !== "draft" ? "Edit request" : "Ask for help"}
        description="Five short steps. Your draft is saved as you go."
      />
      <RequestWizard
        owner="requester"
        base="/requester/requests/new"
        detailBase="/requester/requests"
        step={step}
        draft={draft}
        categories={categories}
        error={sp.error}
        saved={sp.saved === "1"}
        canPostSensitive={user?.trust_tier === "trusted"}
      />
    </>
  );
}
