import { csvCell } from "../../../../lib/csv";
import { inOrg } from "../../../../lib/access";
import { backendFetch, getCurrentUser } from "../../../lib/backend";
import { getOrgContext } from "../../../lib/org";
import { Buffer } from "buffer";

const csvEscape = csvCell;

function pdfEscape(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildSimplePdf(title: string, lines: string[]): Uint8Array {
  // Minimal single-page PDF generator (Helvetica). Good enough for lightweight exports.
  const header = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";

  const contentLines: string[] = [];
  // Title
  contentLines.push(`BT /F1 16 Tf 50 760 Td (${pdfEscape(title)}) Tj ET`);
  let y = 736;
  for (const line of lines) {
    const safe = pdfEscape(line);
    contentLines.push(`BT /F1 10 Tf 50 ${y} Td (${safe}) Tj ET`);
    y -= 14;
    if (y < 60) break; // one page only
  }
  const stream = contentLines.join("\n") + "\n";
  const streamBytes = new TextEncoder().encode(stream);

  const objects: string[] = [];
  const offsets: number[] = [];

  const pushObj = (s: string) => {
    offsets.push(header.length + objects.join("").length);
    objects.push(s);
  };

  pushObj("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  pushObj("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  pushObj(
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n"
  );
  pushObj("4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n");
  pushObj(`5 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n${stream}endstream\nendobj\n`);

  const body = objects.join("");
  const xrefStart = header.length + body.length;

  let xref = "xref\n0 6\n0000000000 65535 f \n";
  const pad10 = (n: number) => String(n).padStart(10, "0");
  for (let i = 0; i < offsets.length; i++) {
    xref += `${pad10(offsets[i])} 00000 n \n`;
  }

  const trailer = `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  const pdf = header + body + xref + trailer;
  return new TextEncoder().encode(pdf);
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!inOrg(user)) return new Response("Forbidden", { status: 403 });

  const ctx = await getOrgContext();
  if (!ctx) return new Response("Organization context required", { status: 403 });
  if (!ctx.org.onboarding_completed) return new Response("Onboarding required", { status: 403 });

  const url = new URL(req.url);
  const type = (url.searchParams.get("type") || "").trim();
  const format = (url.searchParams.get("format") || "").trim();
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  const requestId = url.searchParams.get("requestId") || "";

  if (!type || !format) return new Response("Missing type/format", { status: 400 });

  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  if (requestId) qs.set("requestId", requestId);
  // Exports carry every row, not the on-screen top rows.
  qs.set("all", "1");

  const today = new Date().toISOString().slice(0, 10);

  if (type === "impact") {
    const res = await backendFetch(`/v1/org/reports/impact?${qs.toString()}`, { method: "GET" });
    if (!res.ok) return new Response(res.status === 403 ? "Only organization admins and managers can export reports" : "Failed to load impact report", { status: res.status === 403 ? 403 : 500 });
    const data = (await res.json()) as any;

    const per = Array.isArray(data?.per_request) ? data.per_request : [];
    if (format === "csv") {
      // One row per request: goal, promised, approved and waiting kept apart, in the request's unit.
      const header = ["request_id", "request", "status", "goal", "unit", "promised", "approved_in_unit", "waiting_in_unit", "approved_hours", "waiting_hours", "volunteers_accepted", "volunteers_with_approved_hours"];
      const lines = [header.map(csvEscape).join(",")];
      for (const r of per) {
        lines.push(
          [r.request_id, r.request_title, r.status, r.target ?? "", r.unit ?? (r.target != null ? "hours" : ""), r.promised ?? "", r.approved_in_unit ?? "", r.waiting_in_unit ?? "", r.approved_hours, r.waiting_hours, r.volunteers_accepted, r.volunteers_approved]
            .map(csvEscape)
            .join(",")
        );
      }
      return new Response("\uFEFF" + lines.join("\r\n") + "\r\n", {
        status: 200,
        headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="requests_${today}.csv"` }
      });
    }

    if (format === "pdf") {
      const hrs = data?.hours ?? {};
      const lines: string[] = [];
      lines.push(`Range: ${from || "start"} to ${to || "today"}`);
      lines.push("Hours count once approved. Waiting and not-approved hours are shown separately.");
      lines.push("");
      lines.push(`Approved hours: ${hrs.approved ?? 0} (${hrs.volunteers ?? 0} volunteers, ${hrs.adjusted_entries ?? 0} approved with a change)`);
      lines.push(`Waiting for approval: ${hrs.waiting ?? 0} h (${hrs.waiting_entries ?? 0} entries)`);
      lines.push(`Not approved: ${hrs.declined ?? 0} h`);
      for (const u of Array.isArray(data?.units) ? data.units : []) lines.push(`${u.unit}: ${u.approved} approved, ${u.waiting} waiting`);
      lines.push(`Typical time to decide (median): ${data?.approval_delay?.median_hours ?? "-"} h over ${data?.approval_delay?.decided ?? 0} decisions`);
      lines.push(
        `Requests published: ${data?.requests?.published ?? 0}; applications: ${data?.applications?.total ?? 0}; accepted: ${data?.applications?.accepted ?? 0}; checked in: ${data?.applications?.attended ?? 0}; completed: ${data?.applications?.completed ?? 0}`
      );
      lines.push("");
      lines.push("By request (goal / promised / approved / waiting):");
      for (const r of per.slice(0, 30)) {
        const unit = r.unit && r.unit !== "hours" ? r.unit : "h";
        lines.push(
          r.target != null
            ? `- ${r.request_title}: ${r.target} / ${r.promised} / ${r.approved_in_unit} / ${r.waiting_in_unit} ${unit}`
            : `- ${r.request_title}: ${r.approved_hours} h approved, ${r.waiting_hours} h waiting`
        );
      }
      const pdf = buildSimplePdf("Volunteer Hours and Outcomes", lines);
      return new Response(Buffer.from(pdf as unknown as Uint8Array), {
        status: 200,
        headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="report_${today}.pdf"` }
      });
    }

    return new Response("Unsupported format", { status: 400 });
  }

  if (type === "volunteer_hours") {
    const res = await backendFetch(`/v1/org/reports/volunteer-hours?${qs.toString()}`, { method: "GET" });
    if (!res.ok) return new Response(res.status === 403 ? "Only organization admins and managers can export reports" : "Failed to load volunteer-hours report", { status: res.status === 403 ? 403 : 500 });
    const data = (await res.json()) as any;
    const rows = Array.isArray(data?.volunteers) ? data.volunteers : [];

    if (format === "csv") {
      const header = ["volunteer_user_id", "volunteer", "email", "approved_hours", "waiting_hours", "not_approved_hours", "approved_entries", "waiting_entries", "last_activity_at"];
      const lines = [header.map(csvEscape).join(",")];
      for (const r of rows) {
        lines.push(
          [r.volunteer_user_id, r.volunteer_display_name || "", r.minor ? "(under 18, hidden)" : r.volunteer_email || "", r.approved_hours ?? 0, r.waiting_hours ?? 0, r.declined_hours ?? 0, r.approved_entries ?? 0, r.waiting_entries ?? 0, r.last_activity_at || ""]
            .map(csvEscape)
            .join(",")
        );
      }
      return new Response("\uFEFF" + lines.join("\r\n") + "\r\n", {
        status: 200,
        headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="volunteer_hours_${today}.csv"` }
      });
    }

    if (format === "pdf") {
      const lines: string[] = [];
      lines.push(`Range: ${from || "start"} to ${to || "today"}`);
      lines.push(`Approved hours: ${data?.approved_hours ?? 0}; waiting for approval: ${data?.waiting_hours ?? 0}`);
      lines.push("");
      for (const r of rows.slice(0, 40)) {
        lines.push(`- ${r.volunteer_display_name || "Volunteer"}: ${r.approved_hours ?? 0} h approved, ${r.waiting_hours ?? 0} h waiting, ${r.declined_hours ?? 0} h not approved`);
      }
      const pdf = buildSimplePdf("Volunteer Hours", lines);
      return new Response(Buffer.from(pdf as unknown as Uint8Array), {
        status: 200,
        headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="volunteer_hours_${today}.pdf"` }
      });
    }

    return new Response("Unsupported format", { status: 400 });
  }

  return new Response("Unknown report type", { status: 400 });
}