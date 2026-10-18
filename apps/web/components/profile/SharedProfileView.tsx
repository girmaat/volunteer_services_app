import { Award, CalendarCheck, Clock, MapPin, Star } from "lucide-react";
import { Card, EmptyState } from "../ui/Card";

export type SharedProfile = {
  name: string | null;
  location: string | null;
  about: string | null;
  total_hours: number | null;
  average_rating: number | null;
  reviews_count: number | null;
  accomplishments: { title: string; by: string; completed_at: string; hours: number }[];
  completed_count: number;
  badges: { id: string; label: string; earned_at: string | null }[];
};

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const hrs = (n: number) => `${Math.round(n * 10) / 10} h`;

/** What someone with a volunteer's share link sees: accomplishments plus the details the volunteer switched on. */
export default function SharedProfileView({ p }: { p: SharedProfile }) {
  const name = p.name || "A ThankYou volunteer";
  const stats = [
    { label: "Opportunities completed", value: String(p.completed_count), icon: CalendarCheck },
    p.total_hours != null ? { label: "Total hours logged", value: hrs(p.total_hours), icon: Clock } : null,
    p.average_rating != null ? { label: "Average rating", value: `${p.average_rating.toFixed(1)} / 5`, icon: Star } : null,
    p.reviews_count != null ? { label: "Reviews received", value: String(p.reviews_count), icon: Star } : null
  ].filter(Boolean) as { label: string; value: string; icon: typeof Clock }[];

  return (
    <div className="grid gap-6">
      <header className="grid gap-2">
        <p className="m-0 text-sm font-semibold uppercase tracking-wide text-primary">Volunteer record</p>
        <h1 className="m-0 text-3xl">{name}</h1>
        {p.location ? (
          <p className="m-0 inline-flex items-center gap-1.5 text-muted">
            <MapPin aria-hidden className="h-4 w-4" /> {p.location}
          </p>
        ) : null}
        {p.about ? <p className="m-0 max-w-2xl whitespace-pre-line">{p.about}</p> : null}
      </header>

      <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-4">
        {stats.map((s) => (
          <li key={s.label}>
            <Card className="grid h-full gap-1">
              <s.icon aria-hidden className="h-5 w-5 text-primary" />
              <span className="font-display text-2xl font-bold">{s.value}</span>
              <span className="text-sm text-muted">{s.label}</span>
            </Card>
          </li>
        ))}
      </ul>

      <section aria-labelledby="acc-h">
        <h2 id="acc-h" className="m-0 text-xl">
          Accomplishments
        </h2>
        {p.accomplishments.length ? (
          <ol className="m-0 mt-3 grid gap-0 border-l-2 border-line p-0 pl-5">
            {p.accomplishments.map((a, i) => (
              <li key={`${a.title}-${i}`} className="relative list-none pb-5 last:pb-0">
                <span aria-hidden className="absolute -left-[27px] top-1.5 h-3 w-3 rounded-full border-2 border-surface bg-primary" />
                <p className="m-0 text-xs font-medium text-muted">{day(a.completed_at)}</p>
                <h3 className="m-0 text-base font-semibold">{a.title}</h3>
                <p className="m-0 text-sm text-muted">
                  {a.by}
                  {a.hours ? ` · ${hrs(a.hours)} approved` : ""}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <div className="mt-3">
            <EmptyState title="No completed opportunities yet" body="Completed volunteering shows up here." />
          </div>
        )}
      </section>

      {p.badges.length ? (
        <section aria-labelledby="badges-h">
          <h2 id="badges-h" className="m-0 text-xl">
            Badges
          </h2>
          <ul className="m-0 mt-3 flex list-none flex-wrap gap-2 p-0">
            {p.badges.map((b) => (
              <li key={b.id} className="inline-flex items-center gap-1.5 rounded-full bg-sun-tint px-3 py-1 text-sm font-medium">
                <Award aria-hidden className="h-4 w-4 text-[#b07d00]" /> {b.label}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="m-0 text-xs text-muted">Hours count only after the organization or person they helped approved them. Contact details are never shown.</p>
    </div>
  );
}
