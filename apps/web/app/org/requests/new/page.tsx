import { redirect } from "next/navigation";
import { PageHeader } from "../../../../components/ui";
import RequestWizard from "../../../../components/requests/RequestWizard";
import { getOrgContext } from "../../../lib/org";
import { getCategories, getOwnerRequest } from "../../../../lib/requests";

export const dynamic = "force-dynamic";

type SP = { id?: string; step?: string; error?: string; saved?: string };

export default async function NewOrgRequestPage(props: { searchParams?: Promise<SP> }) {
  const sp = (await props.searchParams) || {};
  const ctx = await getOrgContext();
  if (!ctx) redirect("/org/signup");
  if (!ctx.org.onboarding_completed) redirect("/org/onboarding");
  if (ctx.membership.role === "member") redirect("/org/requests?error=" + encodeURIComponent("Only admins and managers can post requests."));
  const [categories, draft] = await Promise.all([getCategories(), sp.id ? getOwnerRequest(sp.id) : Promise.resolve(null)]);
  const step = draft ? Math.min(5, Math.max(1, Number(sp.step) || 1)) : 1;
  const verified = ["approved", "verified"].includes(ctx.org.verification_status);
  return (
    <>
      <PageHeader title={draft?.status && draft.status !== "draft" ? "Edit request" : "Post a request"} description={`For ${ctx.org.name}. Your draft is saved as you go.`} />
      <RequestWizard
        owner="org"
        base="/org/requests/new"
        detailBase="/org/requests"
        step={step}
        draft={draft}
        categories={categories}
        error={sp.error}
        saved={sp.saved === "1"}
        canPostSensitive={verified}
      />
    </>
  );
}
