import { NextResponse, type NextRequest } from "next/server";
import { API_BASE_URL_SERVER as API_BASE_URL } from "@thankyou/config";

function stripTrailingSlash(url: string) {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

const ALLOW_PREFIXES = [
  "/maintenance",
  "/admin",
  "/api",
  "/share",
  "/s",
  "/v1",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/_next",
  "/favicon.ico"
];

// Maintenance mode is read from the API at most once every 30 seconds per server instance,
// instead of on every request (it used to add a backend round-trip to every navigation).
const MAINTENANCE_TTL_MS = 30_000;
let maintenanceCache: { value: boolean; at: number } | null = null;

async function isMaintenanceEnabled(): Promise<boolean> {
  if (process.env.MAINTENANCE_MODE === "true") return true;
  const now = Date.now();
  if (maintenanceCache && now - maintenanceCache.at < MAINTENANCE_TTL_MS) return maintenanceCache.value;
  let value = false;
  try {
    const res = await fetch(`${stripTrailingSlash(API_BASE_URL)}/v1/platform/status`, {
      cache: "no-store",
      signal: AbortSignal.timeout(1500)
    });
    if (res.ok) {
      const json = (await res.json()) as { maintenance?: { enabled?: boolean } };
      value = Boolean(json?.maintenance?.enabled);
    }
  } catch {
    // If the backend is unavailable, do not lock the whole site.
    value = false;
  }
  maintenanceCache = { value, at: now };
  return value;
}

function shouldClearFlash(pathname: string) {
  return (
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname === "/signup" ||
    pathname.startsWith("/signup/") ||
    pathname === "/forgot-password" ||
    pathname.startsWith("/forgot-password/") ||
    pathname === "/reset-password" ||
    pathname.startsWith("/reset-password/") ||
    pathname === "/verify-email" ||
    pathname.startsWith("/verify-email/")
  );
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname || "/";

  // Flash cookie is a one-time message used by auth routes.
  // We clear it on the next navigation to an auth page so it doesn't persist.
  if (shouldClearFlash(pathname) && request.cookies.get("ty_flash")) {
    const res = NextResponse.next();
    res.cookies.set("ty_flash", "", { path: "/", maxAge: 0 });
    return res;
  }

  if (ALLOW_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  if (await isMaintenanceEnabled()) {
    const url = request.nextUrl.clone();
    url.pathname = "/maintenance";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};