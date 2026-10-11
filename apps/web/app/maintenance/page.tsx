import Link from "next/link";
import { API_BASE_URL_SERVER } from "@thankyou/config";

export const revalidate = 300;

type PlatformStatus = {
  maintenance: { enabled: boolean; message: string | null; updated_at: string };
};

function stripTrailingSlash(url: string) {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

async function getStatus(): Promise<PlatformStatus | null> {
  try {
    const res = await fetch(`${stripTrailingSlash(API_BASE_URL_SERVER)}/v1/platform/status`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    return (await res.json()) as PlatformStatus;
  } catch {
    return null;
  }
}

export default async function MaintenancePage() {
  const status = await getStatus();
  const enabled = Boolean(status?.maintenance?.enabled);
  const message = status?.maintenance?.message?.trim() || "We’re doing some quick maintenance. Please check back soon.";

  return (
    <div className="edgeShell">
      <div className="edgeCard">
        {enabled ? (
          <>
            <h1 className="edgeTitle">We&apos;ll be right back</h1>
            <p className="edgeSubtitle">{message}</p>
            <p className="muted text-xs mt-3">
              Last update: {status?.maintenance?.updated_at ? new Date(status.maintenance.updated_at).toLocaleString() : "—"}
            </p>
          </>
        ) : (
          <>
            <h1 className="edgeTitle">Maintenance mode is off</h1>
            <p className="edgeSubtitle">
              The platform is currently available. If you were redirected here, just go back to the homepage.
            </p>
          </>
        )}

        <div className="edgeActions">
          <Link className="btn" href="/">Go home</Link>
          <Link className="btn btnSoft" href="/login">Log in</Link>
          <Link className="btn btnSoft" href="/admin">Admin</Link>
        </div>
      </div>
    </div>
  );
}
