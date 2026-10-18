import type { Metadata } from "next";
import InfoPage from "../../components/content/InfoPage";
import { TRUST_SAFETY } from "../../content/pages";

export const metadata: Metadata = { title: "Trust & safety", description: TRUST_SAFETY.lead, alternates: { canonical: "/trust-safety" } };

export default function Page() {
  return <InfoPage page={TRUST_SAFETY} />;
}
