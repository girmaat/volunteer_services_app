import { redirect } from "next/navigation";

/** Organization setup is one page now. */
export default function Page() {
  redirect("/org/onboarding");
}
