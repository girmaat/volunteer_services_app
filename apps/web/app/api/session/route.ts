import { NextResponse } from "next/server";
import { getCurrentUser } from "../../lib/backend";

export const dynamic = "force-dynamic";

/**
 * Minimal session info for client components (site navigation). Lets the root layout stay
 * free of cookies so public pages can be statically generated.
 */
export async function GET() {
  const user = await getCurrentUser().catch(() => null);
  const body = user
    ? { user: { role: user.role, is_platform_admin: Boolean(user.is_platform_admin), onboarding_completed: Boolean(user.onboarding_completed), has_org: Boolean(user.orgs?.length) } }
    : { user: null };
  return NextResponse.json(body, { headers: { "cache-control": "private, no-store" } });
}
