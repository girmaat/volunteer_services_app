import { publishTarget, wizardStepTarget } from "../../../_requests/wizard";

/** 303 with a relative Location, so the browser follows with a GET to our own origin. */
function seeOther(location: string) {
  return new Response(null, { status: 303, headers: { Location: location, "Cache-Control": "no-store" } });
}

/**
 * The posting wizard's steps are plain form posts (no client router), so each step is a full
 * page load: fast double-clicks and slow networks can't leave the wizard on the wrong step.
 */
export async function POST(req: Request) {
  const fd = await req.formData();
  if (String(fd.get("intent") || "") === "publish") return seeOther(await publishTarget(fd));
  return seeOther(await wizardStepTarget(fd));
}
