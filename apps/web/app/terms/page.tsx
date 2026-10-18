import type { Metadata } from "next";
import InfoPage from "../../components/content/InfoPage";
import { TERMS } from "../../content/pages";

export const metadata: Metadata = { title: "Terms of service", description: TERMS.lead, alternates: { canonical: "/terms" } };

export default function Page() {
  return <InfoPage page={TERMS} />;
}
