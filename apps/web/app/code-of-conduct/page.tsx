import type { Metadata } from "next";
import InfoPage from "../../components/content/InfoPage";
import { CODE_OF_CONDUCT } from "../../content/pages";

export const metadata: Metadata = { title: "Code of conduct", description: CODE_OF_CONDUCT.lead, alternates: { canonical: "/code-of-conduct" } };

export default function Page() {
  return <InfoPage page={CODE_OF_CONDUCT} />;
}
