import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// The requester landing page is intentionally kept lean.
// Requesters should start in the Requests area (and can reach public pages from global nav).
export default async function Page() {
  redirect("/requester/requests");
}
