import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { API_BASE_URL_SERVER } from "@thankyou/config";
import ShareButton from "../../_components/share/ShareButton";
import Markdown from "../../../components/content/Markdown";
import { buttonClass } from "../../../components/ui/Button";

export const revalidate = 300;

type StoryDetail = { id: number; slug: string; title: string; excerpt: string; body: string; cover_image_url: string | null; updated_at: string };
type Props = { params: Promise<{ slug: string }> };

async function getStory(slug: string): Promise<StoryDetail | null> {
  try {
    const res = await fetch(`${API_BASE_URL_SERVER}/v1/public/stories/${encodeURIComponent(slug)}`, { next: { revalidate: 300 }, signal: AbortSignal.timeout(5000) });
    return res.ok ? ((await res.json()) as StoryDetail) : null;
  } catch {
    return null;
  }
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const s = await getStory((await props.params).slug);
  return s ? { title: s.title, description: s.excerpt, alternates: { canonical: `/impact-stories/${s.slug}` } } : { title: "Story not found" };
}

export default async function Page(props: Props) {
  const story = await getStory((await props.params).slug);
  if (!story) notFound();
  return (
    <article className="mx-auto grid max-w-3xl gap-6 py-4">
      <Link prefetch={false} href="/impact-stories" className="inline-flex w-fit items-center gap-1 text-sm text-muted no-underline hover:text-primary">
        <ArrowLeft aria-hidden className="h-4 w-4" /> Impact stories
      </Link>
      <header className="grid gap-3 border-b border-line pb-6">
        <h1 className="m-0 text-3xl sm:text-4xl">{story.title}</h1>
        <p className="m-0 text-lg text-muted">{story.excerpt}</p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="m-0 text-sm text-muted">{new Date(story.updated_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
          <ShareButton target={{ type: "impact", ref: story.slug, title: story.title }} label="Share" />
        </div>
      </header>
      {story.cover_image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="w-full rounded-lg border border-line" src={story.cover_image_url} alt="" />
      ) : null}
      <Markdown body={story.body || story.excerpt} />
      <div className="mt-4 flex flex-wrap gap-3 border-t border-line pt-6">
        <Link prefetch={false} href="/opportunities" className={buttonClass("primary")}>
          Find opportunities
        </Link>
        <Link prefetch={false} href="/impact-stories" className={buttonClass("secondary")}>
          More stories
        </Link>
      </div>
    </article>
  );
}
