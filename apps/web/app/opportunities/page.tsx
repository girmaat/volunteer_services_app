import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hasRole } from "../../lib/access";
import { getCurrentUser } from "../lib/backend";
import FindOpportunities from "../../components/opportunities/FindOpportunities";
import { getCategories } from "../../lib/requests";
import { buttonClass } from "../../components/ui/Button";

export const metadata: Metadata = {
  title: "Volunteer opportunities",
  description: "Browse in-person, remote and hybrid volunteer opportunities from verified organizations and neighbors.",
  alternates: { canonical: "/opportunities" }
};

type SearchParams = Record<string, string | string[] | undefined>;


export default async function Page(props: { searchParams?: Promise<SearchParams> }) {
  const sp = (await props.searchParams) || {};
  const me = await getCurrentUser().catch(() => null);

  // Volunteers get the personalised feed (recommended / nearby / remote).
  if (hasRole(me, "volunteer") && !me?.is_platform_admin) redirect("/volunteer/opportunities/recommended");

  const categories = await getCategories();

  return (
    <div className="grid gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 text-2xl sm:text-3xl">Volunteer opportunities</h1>
          <p className="m-0 mt-2 max-w-[60ch] text-muted">
            Exact addresses and contact details are shared only after an application is accepted.
          </p>
        </div>
        {!me ? (
          <Link prefetch={false} className={buttonClass("primary", "md")} href="/signup">
            Create an account to apply
          </Link>
        ) : null}
      </header>
      <FindOpportunities sp={sp} tab="all" basePath="/opportunities" detailBase="/opportunities" personalized={false} categories={categories} />
    </div>
  );
}
