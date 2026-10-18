import { ImageResponse } from "next/og";
import { OG_SIZE, OgCard } from "../../../components/og/card";
import { getPublicOpportunity } from "../../../lib/public-api";

export const alt = "Volunteer opportunity on Volunteer Services";
export const size = OG_SIZE;
export const contentType = "image/png";

/** Share image for an opportunity: its title, and where it happens (public area only). */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const o = await getPublicOpportunity(decodeURIComponent(id)).catch(() => null);
  const title = o ? o.title.slice(0, 110) : "Volunteer opportunity";
  const where = o ? (o.mode === "remote" ? "Remote" : o.location || "In person") : "Volunteer Services";
  return new ImageResponse(<OgCard eyebrow="Volunteer opportunity" title={title} footer={where} />, size);
}
