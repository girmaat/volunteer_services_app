import type { Metadata } from "next";
import InfoPage from "../../components/content/InfoPage";
import { ABOUT } from "../../content/pages";

export const metadata: Metadata = { title: "About Volunteer Services", description: ABOUT.lead, alternates: { canonical: "/about" } };

export default function Page() {
  return <InfoPage page={ABOUT} />;
}
