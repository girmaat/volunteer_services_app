import Link from "next/link";
import { backendFetch, getCurrentUser } from "../../lib/backend";
import { getOrgContext } from "../../lib/org";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type OrgApplication = {
  application_id: string;
  status: string;
  message: string | null;
  created_at: string;
  request_id: string;
  request_title: string;
  volunteer_user_id: string;
  volunteer_email: string;
  volunteer_display_name: string | null;
};

async function load(): Promise<OrgApplication[]> {
  const res = await backendFetch("/v1/org/applications", { method: "GET" });
  if (!res.ok) throw new Error("Failed to load applications");
  const data = await res.json();
  return (data?.applications || []) as OrgApplication[];
}

async function setStatus(id: string, status: string) {
  "use server";
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "org_admin") redirect("/dashboard");
  const ctx = await getOrgContext();
  if (!ctx) redirect("/org/signup");

  const res = await backendFetch(`/v1/org/applications/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status })
  });
  if (!res.ok) redirect(`/org/applications?error=${encodeURIComponent("Update failed")}`);
  redirect("/org/applications");
}

export default async function Page({ searchParams }: { searchParams?: { error?: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "org_admin") redirect("/dashboard");
  const ctx = await getOrgContext();
  if (!ctx) redirect("/org/signup");
  if (!ctx.org.onboarding_completed) redirect("/org/onboarding");

  const rows = await load();

  return (
    <div>
      <h2>Org applications</h2>
      {searchParams?.error ? <p style={{ color: "crimson" }}>{searchParams.error}</p> : null}

      {rows.length === 0 ? (
        <p>No applications yet.</p>
      ) : (
        <ul style={{ display: "grid", gap: 12, paddingLeft: 18 }}>
          {rows.map((a) => (
            <li key={a.application_id}>
              <div>
                <Link href={`/org/requests/${a.request_id}`}>{a.request_title}</Link>
              </div>
              <div style={{ opacity: 0.75 }}>
                From: {a.volunteer_display_name || a.volunteer_email} · Status: {a.status}
              </div>
              {a.message ? <div style={{ marginTop: 6 }}>{a.message}</div> : null}

              <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Link href={`/org/messages/${a.volunteer_user_id}?requestId=${a.request_id}&applicationId=${a.application_id}`}>Message</Link>

                {(a.status === "pending" || a.status === "waitlisted") ? (
                  <>
                    <form action={setStatus.bind(null, a.application_id, "accepted")}>
                      <button type="submit">Accept</button>
                    </form>

                    {a.status === "pending" ? (
                      <form action={setStatus.bind(null, a.application_id, "waitlisted")}>
                        <button type="submit">Waitlist</button>
                      </form>
                    ) : (
                      <form action={setStatus.bind(null, a.application_id, "pending")}>
                        <button type="submit">Move to pending</button>
                      </form>
                    )}

                    <form action={setStatus.bind(null, a.application_id, "rejected")}>
                      <button type="submit">Reject</button>
                    </form>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
