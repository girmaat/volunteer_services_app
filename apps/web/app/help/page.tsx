import type { Metadata } from "next";
import InfoPage from "../../components/content/InfoPage";
import { HELP } from "../../content/pages";

export const metadata: Metadata = { title: "Help center", description: HELP.lead, alternates: { canonical: "/help" } };

export default function Page() {
  return <InfoPage page={HELP} />;
}
