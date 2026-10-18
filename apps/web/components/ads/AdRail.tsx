import type { PublicAd } from "../../lib/public-api";

/** One side panel of advertisements on the public pages. Each ad is clearly labelled. */
export default function AdRail({ ads, side }: { ads: PublicAd[]; side: "left" | "right" }) {
  if (!ads.length) return null;
  return (
    <aside aria-label={`Advertisements (${side})`} className="sticky top-24 grid content-start gap-4">
      {ads.map((a) => {
        const external = Boolean(a.link_url && /^https?:\/\//i.test(a.link_url));
        const inner = (
          <>
            <span className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted">Sponsored</span>
            {a.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- uploaded images served from /media
              <img src={a.image_url} alt="" className="mt-2 aspect-[4/3] w-full rounded object-cover" />
            ) : null}
            <span className="mt-2 block font-semibold leading-snug text-ink">{a.title}</span>
            {a.body ? <span className="mt-1 block text-sm text-muted">{a.body}</span> : null}
            {a.link_url ? <span className="mt-2 block text-sm font-medium text-primary">Learn more →</span> : null}
          </>
        );
        return a.link_url ? (
          <a
            key={a.id}
            href={a.link_url}
            {...(external ? { target: "_blank", rel: "sponsored noopener noreferrer" } : { rel: "sponsored" })}
            className="block rounded-md border border-line bg-surface p-3 no-underline hover:border-line-strong"
          >
            {inner}
          </a>
        ) : (
          <div key={a.id} className="rounded-md border border-line bg-surface p-3">
            {inner}
          </div>
        );
      })}
    </aside>
  );
}
