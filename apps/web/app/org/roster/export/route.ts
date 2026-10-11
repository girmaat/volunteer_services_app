import { inOrg } from "../../../../lib/access";
import { backendFetch, getCurrentUser } from "../../../lib/backend";
import { getOrgContext } from "../../../lib/org";

function csvEscape(value: unknown) {
  const s = String(value ?? "");
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!inOrg(user)) return new Response("Forbidden", { status: 403 });
  const ctx = await getOrgContext();
  if (!ctx) return new Response("Organization context required", { status: 403 });
  if (!ctx.org.onboarding_completed) return new Response("Onboarding required", { status: 403 });

  const url = new URL(req.url);
  const qs = url.searchParams;
  const status = qs.get("status") || "active";
  const requestId = qs.get("requestId") || "";
  const search = qs.get("search") || "";

  const backendQs = new URLSearchParams();
  backendQs.set("status", status);
  if (requestId) backendQs.set("requestId", requestId);
  if (search) backendQs.set("search", search);

  const res = await backendFetch(`/v1/org/roster?${backendQs.toString()}`, { method: "GET" });
  if (!res.ok) {
    return new Response("Failed to export roster", { status: 500 });
  }

  const data = (await res.json()) as { roster?: any[] };
  const rows = Array.isArray(data.roster) ? data.roster : [];

  const header = [
    "volunteer_user_id",
    "volunteer_email",
    "volunteer_display_name",
    "volunteer_public_location",
    "active_count",
    "waitlisted_count",
    "completed_count",
    "total_count",
    "last_activity_at",
    "request_titles"
  ];

  const lines = [header.map(csvEscape).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.volunteer_user_id,
        r.volunteer_email,
        r.volunteer_display_name || "",
        r.volunteer_public_location || "",
        r.active_count ?? 0,
        r.waitlisted_count ?? 0,
        r.completed_count ?? 0,
        r.total_count ?? 0,
        r.last_activity_at || "",
        Array.isArray(r.request_titles) ? r.request_titles.join("; ") : ""
      ]
        .map(csvEscape)
        .join(",")
    );
  }

  const csv = lines.join("\n") + "\n";
  const filename = `roster_${status}_${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`
    }
  });
}
