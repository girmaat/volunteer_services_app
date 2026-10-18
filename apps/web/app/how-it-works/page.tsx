import type { Metadata } from "next";
import InfoPage from "../../components/content/InfoPage";
import { HOW_IT_WORKS } from "../../content/pages";

export const metadata: Metadata = { title: "How it works", description: HOW_IT_WORKS.lead, alternates: { canonical: "/how-it-works" } };

export default function Page() {
  return <InfoPage page={HOW_IT_WORKS} />;
}
