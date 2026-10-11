import { ImageResponse } from "next/og";
import { OG_SIZE, OgCard } from "../components/og/card";

export const alt = "ThankYou — volunteer with neighbors and nonprofits";
export const size = OG_SIZE;
export const contentType = "image/png";

/** Default share image for every page that doesn't define its own. */
export default function Image() {
  return new ImageResponse(<OgCard eyebrow="Volunteer with neighbors and nonprofits" title="Find a way to help, near you or remote." footer="thankyou · free for volunteers and nonprofits" />, size);
}
