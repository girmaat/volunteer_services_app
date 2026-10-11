import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, MessageCircle, ShieldCheck, Sparkles } from "lucide-react";
import { backendFetch, getCurrentUser } from "../../lib/backend";
import { ButtonLink, Card, EmptyState } from "../../../components/ui";
import OpportunityRow, { type OpportunitySummary } from "../../../components/opportunities/OpportunityRow";

export const dynamic = "force-dynamic";
export const metadata = { title: "You’re all set", robots: { index: false } };

/** The end of onboarding: real opportunities for volunteers, a clear first step for requesters. */
export default async function WelcomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.onboarding_completed) redirect("/onboarding");
  if (user.role === "org_admin") redirect("/org/dashboard");
  const name = user.display_name ? `, ${user.display_name}` : "";

  if (user.role === "requester") {
    return (
      <div className="mx-auto max-w-2xl">
        <p className="m-0 flex items-center gap-2 text-sm font-semibold text-success">
          <CheckCircle2 aria-hidden className="h-5 w-5" /> You’re all set
        </p>
        <h1 className="m-0 mt-2 font-display text-3xl font-bold">Welcome{name}. What do you need a hand with?</h1>
        <p className="m-0 mt-2 text-lg text-muted">Describe it in a few steps. Volunteers nearby see it and offer to help.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink href="/requester/requests/new" size="lg">
            Ask for help
          </ButtonLink>
          <ButtonLink href="/requester/dashboard" variant="secondary" size="lg">
            Go to my home
          </ButtonLink>
        </div>
        <ul className="m-0 mt-10 grid gap-4 p-0 sm:grid-cols-3">
          {[
            { icon: <Sparkles aria-hidden className="h-5 w-5" />, t: "Free, always", b: "Volunteers give their time. Nobody should ask you for money." },
            { icon: <ShieldCheck aria-hidden className="h-5 w-5" />, t: "You choose who helps", b: "See each volunteer’s reviews and reliability before you accept." },
            { icon: <MessageCircle aria-hidden className="h-5 w-5" />, t: "Talk in the app", b: "Your address and phone stay private until you accept someone." }
          ].map((x) => (
            <li key={x.t} className="list-none">
              <Card className="h-full p-5">
                <span className="text-primary">{x.icon}</span>
                <h2 className="m-0 mt-2 text-base font-semibold">{x.t}</h2>
                <p className="m-0 mt-1 text-sm text-muted">{x.b}</p>
              </Card>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const res = await backendFetch("/v1/discovery/opportunities?tab=recommended&limit=4");
  const data = res.ok ? ((await res.json()) as { items: OpportunitySummary[]; viewer: { timezone: string | null } | null }) : null;
  const items = data?.items ?? [];

  return (
    <div className="mx-auto max-w-3xl">
      <p className="m-0 flex items-center gap-2 text-sm font-semibold text-success">
        <CheckCircle2 aria-hidden className="h-5 w-5" /> You’re all set
      </p>
      <h1 className="m-0 mt-2 font-display text-3xl font-bold">Welcome{name}. Here’s what we found for you</h1>
      <p className="m-0 mt-2 text-lg text-muted">Picked for your interests, schedule and neighborhood. Open one to see the details and offer to help.</p>
      {items.length ? (
        <ul className="m-0 mt-6 border-t border-line p-0">
          {items.map((o) => (
            <OpportunityRow key={o.id} o={o} href={`/volunteer/opportunities/${o.id}`} viewerTz={data?.viewer?.timezone} />
          ))}
        </ul>
      ) : (
        <div className="mt-6">
          <EmptyState title="Nothing matches yet" body="New requests arrive every day. Browse everything open right now, or widen your interests in your profile." />
        </div>
      )}
      <div className="mt-6 flex flex-wrap gap-3">
        <ButtonLink href="/volunteer/opportunities/recommended" size="lg">
          See all opportunities
        </ButtonLink>
        <ButtonLink href="/volunteer/dashboard" variant="secondary" size="lg">
          Go to my home
        </ButtonLink>
      </div>
      <p className="m-0 mt-6 text-sm text-muted">
        Want better matches? Add more skills or causes in{" "}
        <Link prefetch={false} href="/volunteer/profile" className="font-medium text-primary">
          your profile
        </Link>
        .
      </p>
    </div>
  );
}
