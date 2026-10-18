import type { Metadata } from "next";
import InfoPage from "../../components/content/InfoPage";
import { PRIVACY } from "../../content/pages";

export const metadata: Metadata = { title: "Privacy policy", description: PRIVACY.lead, alternates: { canonical: "/privacy" } };

export default function Page() {
  return <InfoPage page={PRIVACY} />;
}
