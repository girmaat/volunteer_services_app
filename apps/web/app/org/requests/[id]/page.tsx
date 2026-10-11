import Link from "next/link";
import { backendFetch, getCurrentUser } from "../../../lib/backend";
import { getOrgContext } from "../../../lib/org";
import { redirect } from "next/navigation";
import styles from "../../org.module.css";

export const dynamic = "force-dynamic";

type OrgRequest = {
  id: string;
  title: string;
  description: string;
  status: string;
  location_text: string | null;
  mode: string | null;
  needed_by: string | null;
  tags: string[] | null;
  updated_at: string;
  applications_total?: number;
  applications_pending?: number;
  applications_active?: number;
  applications_confirmed?: number;
};

async function load(id: string): Promise<OrgRequest> {
  const res = await backendFetch(`/v1/org/requests/${id}`, { method: "GET" });
  if (!res.ok) throw new Error("Failed to load request");
  return (await res.json()) as OrgRequest;
}

function formatDate(s: string | null) {
  if (!s) return null;
  try {
    return new Date(s).toLocaleString();
  } catch {
    return s;
  }
}

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "org_admin") redirect("/dashboard");
  const ctx = await getOrgContext();
  if (!ctx) redirect("/org/signup");
  if (!ctx.org.onboarding_completed) redirect("/org/onboarding");

  const r = await load(params.id);

  const pending = Number(r.applications_pending ?? 0);
  const total = Number(r.applications_total ?? 0);

  return (
    <div className={styles.stack}>
      <div className={styles.headerRow}>
        <div>
          <h2 style={{ margin: 0 }}>{r.title}</h2>
          <p className={styles.meta} style={{ marginTop: 6, marginBottom: 0 }}>
            Status: <strong>{r.status}</strong> · Updated {formatDate(r.updated_at)}
          </p>
        </div>
        <div className={styles.actions}>
          <Link className={styles.secondaryLink} href={`/org/requests/${r.id}/edit`}>
            Edit
          </Link>
          <Link className={styles.primaryButtonLink} href={`/org/requests/${r.id}/applications`}>
            Applications {pending > 0 ? `(${pending})` : total > 0 ? `(${total})` : "" }
          </Link>
        </div>
      </div>

      <div className={styles.card}>
        <h3 style={{ marginTop: 0 }}>Details</h3>
        <p style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{r.description}</p>

        <div className={styles.grid2} style={{ marginTop: 12 }}>
          <div>
            <div className={styles.label}>Location</div>
            <div>{r.location_text || "—"}</div>
          </div>
          <div>
            <div className={styles.label}>Mode</div>
            <div>{r.mode || "—"}</div>
          </div>
          <div>
            <div className={styles.label}>Needed by</div>
            <div>{formatDate(r.needed_by) || "—"}</div>
          </div>
          <div>
            <div className={styles.label}>Tags</div>
            <div>{r.tags && r.tags.length ? r.tags.join(", ") : "—"}</div>
          </div>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.headerRowSmall}>
          <h3 style={{ margin: 0 }}>Manage</h3>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link className={styles.smallLink} href={`/org/requests/${r.id}/documents`}>
              Documents
            </Link>
            <Link className={styles.smallLink} href={`/org/attendance?requestId=${r.id}`}>
              Attendance
            </Link>
            <Link className={styles.smallLink} href={`/org/incidents?requestId=${r.id}`}>
              Incidents
            </Link>
          </div>
        </div>

        <div className={styles.tileGrid} style={{ marginTop: 10 }}>
          <div className={styles.tile}>
            <div className={styles.tileLabel}>Applications</div>
            <div className={styles.tileValue}>{total}</div>
          </div>
          <div className={styles.tile}>
            <div className={styles.tileLabel}>Pending</div>
            <div className={styles.tileValue}>{pending}</div>
          </div>
          <div className={styles.tile}>
            <div className={styles.tileLabel}>Active</div>
            <div className={styles.tileValue}>{Number(r.applications_active ?? 0)}</div>
          </div>
          <div className={styles.tile}>
            <div className={styles.tileLabel}>Confirmed</div>
            <div className={styles.tileValue}>{Number(r.applications_confirmed ?? 0)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
