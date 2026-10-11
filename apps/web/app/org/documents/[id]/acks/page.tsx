import { inOrg } from "../../../../../lib/access";
import Link from "next/link";
import { redirect } from "next/navigation";
import styles from "../../../org.module.css";
import { backendFetch, getCurrentUser } from "../../../../lib/backend";
import { getOrgContext } from "../../../../lib/org";

export const dynamic = "force-dynamic";

type AckRow = {
  id: string;
  volunteer_user_id: string;
  volunteer_email: string | null;
  volunteer_display_name: string | null;
  acknowledged_at: string;
};

async function loadAcks(docId: string, requestId: string): Promise<AckRow[]> {
  const res = await backendFetch(`/v1/org/documents/${docId}/acks?requestId=${encodeURIComponent(requestId)}`, { method: "GET" });
  if (!res.ok) throw new Error("Failed to load acknowledgements");
  const json = (await res.json()) as { acknowledgements?: AckRow[] };
  return Array.isArray(json.acknowledgements) ? json.acknowledgements : [];
}

export default async function Page(
  props: {
    params: Promise<{ id: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!inOrg(user)) redirect("/dashboard");
  const ctx = await getOrgContext();
  if (!ctx) redirect("/org/signup");
  if (!ctx.org.onboarding_completed) redirect("/org/onboarding");

  const requestId = typeof searchParams.requestId === "string" ? searchParams.requestId : "";
  if (!requestId) redirect("/org/documents");

  const rows = await loadAcks(params.id, requestId);

  return (
    <div className={styles.mainFull}>
      <div className="flex justify-between items-baseline gap-3 flex-wrap">
        <h1 className="m-0">Acknowledgements</h1>
        <Link prefetch={false} className={styles.smallLink} href={`/org/requests/${requestId}/documents`}>
          Back to request docs
        </Link>
      </div>

      <div className={`${styles.card} mt-3`}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>When</th>
              <th>Volunteer</th>
              <th>User ID</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className={styles.muted}>
                  No acknowledgements yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.acknowledged_at).toLocaleString()}</td>
                  <td>{r.volunteer_display_name || r.volunteer_email || r.volunteer_user_id}</td>
                  <td className={`${styles.muted} text-xs`}>
                    {r.volunteer_user_id}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
