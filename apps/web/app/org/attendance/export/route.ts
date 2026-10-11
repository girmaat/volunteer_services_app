import { csvCell } from "../../../../lib/csv";
import { inOrg } from "../../../../lib/access";
import { backendFetch, getCurrentUser } from "../../../lib/backend";
import { getOrgContext } from "../../../lib/org";

const csvEscape = csvCell;

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!inOrg(user)) return new Response("Forbidden", { status: 403 });
  const ctx = await getOrgContext();
  if (!ctx) return new Response("Organization context required", { status: 403 });
  if (!ctx.org.onboarding_completed) return new Response("Onboarding required", { status: 403 });

  const url = new URL(req.url);
  const qs = url.searchParams;

  const backendQs = new URLSearchParams();
  const requestId = qs.get("requestId") || "";
  const volunteerUserId = qs.get("volunteerUserId") || "";
  const status = qs.get("status") || "all";
  const from = qs.get("from") || "";
  const to = qs.get("to") || "";

  if (requestId) backendQs.set("requestId", requestId);
  if (volunteerUserId) backendQs.set("volunteerUserId", volunteerUserId);
  if (status) backendQs.set("status", status);
  if (from) backendQs.set("from", from);
  if (to) backendQs.set("to", to);

  const res = await backendFetch(`/v1/org/attendance?${backendQs.toString()}`, { method: "GET" });
  if (!res.ok) return new Response("Failed to export attendance", { status: 500 });

  const data = (await res.json()) as { attendance?: any[] };
  const rows = Array.isArray(data.attendance) ? data.attendance : [];

  const header = ["id", "request_id", "request_title", "volunteer_user_id", "volunteer_email", "volunteer_display_name", "check_in_at", "check_out_at", "hours", "notes"];

  const lines = [header.map(csvEscape).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.request_id,
        r.request_title,
        r.volunteer_user_id,
        r.volunteer_email || "",
        r.volunteer_display_name || "",
        r.check_in_at || "",
        r.check_out_at || "",
        r.hours ?? "",
        r.notes || ""
      ]
        .map(csvEscape)
        .join(",")
    );
  }

  const csv = lines.join("\n") + "\n";
  const filename = `attendance_${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`
    }
  });
}
