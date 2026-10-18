import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Sparkles } from "lucide-react";
import { API_BASE_URL_SERVER } from "@volunteer_services_app/config";
import { buttonClass } from "../../components/ui/Button";
import { Card, EmptyState } from "../../components/ui/Card";

export const metadata: Metadata = {
  title: "Impact stories",
  description: "Real moments of help from volunteers, neighbors and organizations on Volunteer Services.",
  alternates: { canonical: "/impact-stories" }
};
export const revalidate = 300;

type Story = { id: number; slug: string; title: string; excerpt: string; updated_at: string; cover_image_url: string | null };

async function getStories(): Promise<Story[] | null> {
  try {
    const res = await fetch(`${API_BASE_URL_SERVER}/v1/public/stories`, { next: { revalidate: 300 }, signal: AbortSignal.timeout(5000) });
    return res.ok ? ((await res.json()) as Story[]) : null;
  } catch {
    return null;
  }
}

const date = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

export default async function Page() {
  const stories = await getStories();
  const [first, ...rest] = stories ?? [];

  return (
    <div className="mx-auto grid max-w-5xl gap-8 py-4">
      <header className="grid gap-2">
        <p className="m-0 text-sm font-semibold uppercase tracking-wide text-primary">Impact stories</p>
        <h1 className="m-0 text-3xl sm:text-4xl">What helping looks like</h1>
        <p className="m-0 max-w-2xl text-lg text-muted">Stories from volunteers, neighbors and organizations about the difference a few hours can make.</p>
      </header>

      {stories === null ? <EmptyState title="Stories are unavailable right now" body="Please try again in a moment." /> : null}
      {stories && !stories.length ? <EmptyState title="No stories yet" body="Check back soon." /> : null}

      {first ? (
        <Link prefetch={false} href={`/impact-stories/${first.slug}`} className="group block text-ink no-underline">
          <Card className="grid gap-3 bg-primary-tint p-6 sm:p-8">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-xs font-semibold text-primary">
              <Sparkles aria-hidden className="h-3.5 w-3.5" /> Featured
            </span>
            <h2 className="m-0 text-2xl group-hover:text-primary group-hover:underline">{first.title}</h2>
            <p className="m-0 max-w-2xl text-lg">{first.excerpt}</p>
            <span className="inline-flex items-center gap-1 font-semibold text-primary">
              Read the story <ArrowRight aria-hidden className="h-4 w-4" />
            </span>
          </Card>
        </Link>
      ) : null}

      {rest.length ? (
        <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-3">
          {rest.map((s) => (
            <li key={s.id}>
              <Link prefetch={false} href={`/impact-stories/${s.slug}`} className="group block h-full text-ink no-underline">
                <Card className="flex h-full flex-col gap-2">
                  <p className="m-0 text-xs text-muted">{date(s.updated_at)}</p>
                  <h2 className="m-0 text-lg leading-snug group-hover:text-primary group-hover:underline">{s.title}</h2>
                  <p className="m-0 flex-1 text-sm text-muted">{s.excerpt}</p>
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
                    Read the story <ArrowRight aria-hidden className="h-4 w-4" />
                  </span>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <Card className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <h2 className="m-0 text-lg">Write the next one</h2>
          <p className="m-0 mt-1 text-sm text-muted">Find an opportunity that fits your week, or post one for your organization.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link prefetch={false} href="/opportunities" className={buttonClass("primary")}>
            Find opportunities
          </Link>
          <Link prefetch={false} href="/org/signup" className={buttonClass("secondary")}>
            Register your organization
          </Link>
        </div>
      </Card>
    </div>
  );
}
