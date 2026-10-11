import { redirect } from "next/navigation";

/** Impact is one page now; this section is on it. */
export default function Page() {
  redirect("/volunteer/history#outcomes");
}
