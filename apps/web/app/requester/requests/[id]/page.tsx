import Link from "next/link";
import { notFound } from "next/navigation";
import styles from "../../requester.module.css";
import { backendFetch } from "../../../lib/backend";
import ShareButton from "../../../_components/share/ShareButton";

export const dynamic = "force-dynamic";

type RequestDetail = {
  id: string;
  requester_user_id: string;
  title: string;
  description: string;
  status: "open" | "paused" | "closed" | string;
  location: string;
  mode: "in-person" | "remote" | "hybrid" | string;
  needed_by: string | null;
  tags: string[] | null;
  requester_org_slug: string | null;
  created_at: string;
  updated_at: string;
};

async function loadRequest(id: string): Promise<RequestDetail> {
  const res = await backendFetch(`/v1/requester/requests/${id}`, { method: "GET" });

  if (res.status === 404) notFound();
  if (!res.ok) throw new Error("Failed to load request");

  return res.json();
}

function statusLabel(s: string) {
  if (s === "open") return "Open";
  if (s === "paused") return "Paused";
  if (s === "closed") return "Closed";
  return s;
}

function modeLabel(mode: string) {
  if (mode === "in-person") return "In-person";
  if (mode === "remote") return "Remote";
  if (mode === "hybrid") return "Hybrid";
  return mode;
}

export default async function Page(
  props: {
    params: Promise<{ id: string }>;
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const id = params.id;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
  if (!isUuid) notFound();

  const request = await loadRequest(id);

  const createdBanner = searchParams?.created === "1";
  const updatedBanner = searchParams?.updated === "1";

  return (
    <div>
      <div className={styles.row}>
        <div>
          <h1 className={styles.sectionTitle}>{request.title}</h1>
          <p className={styles.meta}>
            <span className={styles.badge}>{statusLabel(request.status)}</span>{" "}
            · {modeLabel(request.mode)}
            {request.location ? ` · ${request.location}` : ""}
          </p>
        </div>
        <div className={styles.actionsRow} style={{ marginTop: 0 } as any}>
          <Link className={styles.button} href={`/requester/requests/${id}/applications`}>
            Applicants
          </Link>
          <Link className={`${styles.button} ${styles.buttonPrimary}`.trim()} href={`/requester/requests/${id}/edit`}>
            Edit
          </Link>
          <ShareButton target={{ type: "request", ref: id, title: request.title }} label="Share" className={styles.button} />
          <Link className={styles.navLink} href="/requester/requests">
            Back to requests
          </Link>
        </div>
      </div>

      {createdBanner ? (
        <div className={`${styles.banner} ${styles.bannerSuccess}`.trim()}>
          <p className={styles.bannerTitle}>Request created</p>
          <p className={styles.bannerBody}>This request is now live and should appear in volunteer opportunity lists.</p>
        </div>
      ) : null}

      {updatedBanner ? (
        <div className={`${styles.banner} ${styles.bannerSuccess}`.trim()}>
          <p className={styles.bannerTitle}>Changes saved</p>
          <p className={styles.bannerBody}>Your updates are now reflected on this page and in the requests list.</p>
        </div>
      ) : null}

      <div className={styles.banner}>
        <p className={styles.bannerBody}>
          Status: <strong>{statusLabel(request.status)}</strong>
          {request.needed_by ? ` · Needed by: ${new Date(request.needed_by).toLocaleDateString()}` : ""}
          {request.requester_org_slug ? ` · Org: ${request.requester_org_slug}` : ""}
          {request.created_at ? ` · Created: ${new Date(request.created_at).toLocaleString()}` : ""}
          {request.updated_at ? ` · Updated: ${new Date(request.updated_at).toLocaleString()}` : ""}
        </p>
      </div>

      <p className={styles.tileBody} style={{ marginTop: "0.85rem" } as any}>
        {request.description}
      </p>

      {request.tags?.length ? (
        <div className={styles.badges} aria-label="Tags">
          {request.tags.map((t) => (
            <span key={t} className={styles.badge}>
              {t}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}


