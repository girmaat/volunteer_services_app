import HoursReview from "../../../components/hours/HoursReview";

export const dynamic = "force-dynamic";
export const metadata = { title: "Volunteer hours" };

export default async function Page(props: { searchParams?: Promise<{ status?: string; flash?: string; error?: string; approved?: string; skipped?: string }> }) {
  const sp = (await props.searchParams) || {};
  return <HoursReview base="/org/hours" status={sp.status || "waiting"} flash={sp.flash} error={sp.error} approved={sp.approved} skipped={sp.skipped} />;
}
