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

  const today = new Date().toISOString().slice(0, 10);

  if (type === "impact") {
    const res = await backendFetch(`/v1/org/reports/impact?${qs.toString()}`, { method: "GET" });
    if (!res.ok) return new Response("Failed to load impact report", { status: 500 });
    const data = (await res.json()) as any;

    if (format === "csv") {
      const lines = [
        [csvEscape("metric"), csvEscape("value")].join(","),
        [csvEscape("requests_total"), csvEscape(data?.requests?.total ?? 0)].join(","),
        [csvEscape("requests_open"), csvEscape(data?.requests?.open ?? 0)].join(","),
        [csvEscape("requests_paused"), csvEscape(data?.requests?.paused ?? 0)].join(","),
        [csvEscape("requests_closed"), csvEscape(data?.requests?.closed ?? 0)].join(","),
        [csvEscape("applications_total"), csvEscape(data?.applications?.total ?? 0)].join(","),
        [csvEscape("applications_pending"), csvEscape(data?.applications?.pending ?? 0)].join(","),
        [csvEscape("applications_accepted"), csvEscape(data?.applications?.accepted ?? 0)].join(","),
        [csvEscape("applications_waitlisted"), csvEscape(data?.applications?.waitlisted ?? 0)].join(","),
        [csvEscape("applications_confirmed"), csvEscape(data?.applications?.confirmed ?? 0)].join(","),
        [csvEscape("applications_completed"), csvEscape(data?.applications?.completed ?? 0)].join(","),
        [csvEscape("outcomes_total_hours"), csvEscape(data?.outcomes?.total_hours ?? 0)].join(","),
        [csvEscape("outcomes_unique_volunteers"), csvEscape(data?.outcomes?.unique_volunteers ?? 0)].join(","),
        [csvEscape("outcomes_completed_engagements"), csvEscape(data?.outcomes?.completed_engagements ?? 0)].join(",")
      ];

      const csv = lines.join("\n") + "\n";
      const filename = `impact_${today}.csv`;

      return new Response(csv, {
        status: 200,
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="${filename}"`
        }
      });
    }

    if (format === "pdf") {
      const lines: string[] = [];
      lines.push(`Range: ${from || "—"} to ${to || "—"}`);
      lines.push("");
      lines.push(`Requests: total=${data?.requests?.total ?? 0}, open=${data?.requests?.open ?? 0}, paused=${data?.requests?.paused ?? 0}, closed=${data?.requests?.closed ?? 0}`);
      lines.push(
        `Applications: total=${data?.applications?.total ?? 0}, pending=${data?.applications?.pending ?? 0}, accepted=${data?.applications?.accepted ?? 0}, waitlisted=${data?.applications?.waitlisted ?? 0}, confirmed=${data?.applications?.confirmed ?? 0}, completed=${data?.applications?.completed ?? 0}`
      );
      lines.push(
        `Outcomes (attendance): total_hours=${data?.outcomes?.total_hours ?? 0}, unique_volunteers=${data?.outcomes?.unique_volunteers ?? 0}, completed_engagements=${data?.outcomes?.completed_engagements ?? 0}`
      );
      lines.push("");
      lines.push("Top opportunities by hours:");
      const top = Array.isArray(data?.top_opportunities_by_hours) ? data.top_opportunities_by_hours : [];
      for (const r of top.slice(0, 20)) {
        lines.push(`- ${r.request_title} (${r.total_hours} hrs, ${r.sessions} sessions)`);
      }

      const pdf = buildSimplePdf("Impact & Outcomes Report", lines);
      const filename = `impact_${today}.pdf`;

      const body = Buffer.from(pdf as unknown as Uint8Array);
      return new Response(body, {
        status: 200,
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `attachment; filename="${filename}"`
        }
      });
    }

    return new Response("Unsupported format", { status: 400 });
  }

  if (type === "volunteer_hours") {
    const res = await backendFetch(`/v1/org/reports/volunteer-hours?${qs.toString()}`, { method: "GET" });
    if (!res.ok) return new Response("Failed to load volunteer-hours report", { status: 500 });
    const data = (await res.json()) as any;
    const rows = Array.isArray(data?.volunteers) ? data.volunteers : [];

    if (format === "csv") {
      const header = ["volunteer_user_id", "volunteer_email", "volunteer_display_name", "closed_sessions", "open_sessions", "total_hours", "last_activity_at"];
      const lines = [header.map(csvEscape).join(",")];
      for (const r of rows) {
        lines.push(
          [
            r.volunteer_user_id,
            r.volunteer_email || "",
            r.volunteer_display_name || "",
            r.closed_sessions ?? 0,
            r.open_sessions ?? 0,
            r.total_hours ?? 0,
            r.last_activity_at || ""
          ]
            .map(csvEscape)
            .join(",")
        );
      }
      const csv = lines.join("\n") + "\n";
      const filename = `volunteer_hours_${today}.csv`;

      return new Response(csv, {
        status: 200,
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="${filename}"`
        }
      });
    }

    if (format === "pdf") {
      const lines: string[] = [];
      lines.push(`Range: ${from || "—"} to ${to || "—"}`);
      if (requestId) lines.push(`Request filter: ${requestId}`);
      lines.push(`Total hours: ${data?.total_hours ?? 0}`);
      lines.push("");
      lines.push("Volunteer hours:");
      for (const r of rows.slice(0, 40)) {
        const name = r.volunteer_display_name || (r.volunteer_user_id || "").slice(0, 8);
        lines.push(`- ${name} (${r.volunteer_email || "—"}): ${r.total_hours ?? 0} hrs, closed=${r.closed_sessions ?? 0}, open=${r.open_sessions ?? 0}`);
      }

      const pdf = buildSimplePdf("Volunteer Hours Summary", lines);
      const filename = `volunteer_hours_${today}.pdf`;

      const body = Buffer.from(pdf as unknown as Uint8Array);
      return new Response(body, {
        status: 200,
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `attachment; filename="${filename}"`
        }
      });
    }

    return new Response("Unsupported format", { status: 400 });
  }

  return new Response("Unknown report type", { status: 400 });
}