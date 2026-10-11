import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import styles from "../../volunteer.module.css";
import OpportunityTabs from "../_components/OpportunityTabs";
import { backendFetch, getCurrentUser } from "../../../lib/backend";

export const dynamic = "force-dynamic";

type OpportunityDetail = {
  id: string;
  title: string;
  summary: string;
  location: string;
  mode: "in-person" | "remote" | "hybrid";
  updated_at: string;
  organization_name: string | null;
  tags: string[];
  saved: boolean;
  application_id: string | null;
  application_status: string | null;
  application_message: string | null;
  application_created_at: string | null;
  requester_user_id: string | null;
};

async function loadOpportunity(id: string): Promise<OpportunityDetail> {
  const res = await backendFetch(`/v1/volunteer/opportunities/${id}`, { method: "GET" });

  if (res.status === 404) notFound();
  if (!res.ok) throw new Error("Failed to load opportunity detail");

  return res.json();
}

function modeLabel(mode: OpportunityDetail["mode"]) {
  if (mode === "in-person") return "Nearby";
  if (mode === "remote") return "Remote";
  return "Hybrid";
}

function statusLabel(status: string | null) {
  if (!status) return "";
  if (status === "pending") return "Pending";
  if (status === "accepted") return "Accepted";
  if (status === "rejected") return "Rejected";
  if (status === "withdrawn") return "Withdrawn";
  if (status === "confirmed") return "Confirmed";
  if (status === "completed") return "Completed";
  return status;
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

  const returnTo = `/volunteer/opportunities/${encodeURIComponent(id)}`;
  const [me, opportunity] = await Promise.all([getCurrentUser(), loadOpportunity(id)]);
  if (!me) redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  const isOwn = !!opportunity.requester_user_id && me.id === opportunity.requester_user_id;

  const chatHref = (() => {
    if (!opportunity.requester_user_id) return "";
    const qs = new URLSearchParams();
    qs.set("requestId", opportunity.id);
    if (opportunity.application_id) qs.set("applicationId", opportunity.application_id);
    return `/volunteer/messages/${opportunity.requester_user_id}?${qs.toString()}`;
  })();

  async function saveAction() {
    "use server";
    const res = await backendFetch(`/v1/volunteer/opportunities/${id}/save`, { method: "POST" });
    if (!res.ok) redirect(`/volunteer/opportunities/${id}?error=save`);
    revalidatePath(`/volunteer/opportunities/${id}`);
    redirect(`/volunteer/opportunities/${id}?saved=1`);
  }

  async function unsaveAction() {
    "use server";
    const res = await backendFetch(`/v1/volunteer/opportunities/${id}/save`, { method: "DELETE" });
    if (!res.ok) redirect(`/volunteer/opportunities/${id}?error=unsave`);
    revalidatePath(`/volunteer/opportunities/${id}`);
    redirect(`/volunteer/opportunities/${id}?unsaved=1`);
  }

  async function applyAction(formData: FormData) {
    "use server";

    if (isOwn) {
      redirect(`/volunteer/opportunities/${id}?error=${encodeURIComponent("You can’t apply to your own request.")}#apply`);
    }

    const message = String(formData.get("message") || "").trim();
    const res = await backendFetch(`/v1/volunteer/opportunities/${id}/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message })
    });

    if (!res.ok) redirect(`/volunteer/opportunities/${id}?error=apply`);
    revalidatePath(`/volunteer/opportunities/${id}`);
    redirect(`/volunteer/opportunities/${id}?applied=1`);
  }

  const savedBanner = searchParams?.saved === "1";
  const unsavedBanner = searchParams?.unsaved === "1";
  const appliedBanner = searchParams?.applied === "1";
  const error = typeof searchParams?.error === "string" ? searchParams?.error : null;

  return (
    <div>
      <div className={styles.row}>
        <div>
          <h2 className={styles.sectionTitle}>{opportunity.title}</h2>
          <p className={styles.meta}>
            {opportunity.organization_name ? `${opportunity.organization_name} · ` : ""}
            {modeLabel(opportunity.mode)} · {opportunity.location}
          </p>
        </div>
        <Link className={styles.navLink} href="/volunteer/opportunities/recommended">
          Back to lists
        </Link>
      </div>

      <OpportunityTabs />

      {savedBanner ? (
        <div className={`${styles.banner} ${styles.bannerSuccess}`.trim()}>
          <p className={styles.bannerTitle}>Saved</p>
          <p className={styles.bannerBody}>This opportunity is now in your Saved list.</p>
        </div>
      ) : null}

      {unsavedBanner ? (
        <div className={`${styles.banner} ${styles.bannerSuccess}`.trim()}>
          <p className={styles.bannerTitle}>Removed from Saved</p>
          <p className={styles.bannerBody}>This opportunity is no longer in your Saved list.</p>
        </div>
      ) : null}

      {appliedBanner ? (
        <div className={`${styles.banner} ${styles.bannerSuccess}`.trim()}>
          <p className={styles.bannerTitle}>Application submitted</p>
          <p className={styles.bannerBody}>
            Your application is now visible on this page.
            {opportunity.requester_user_id ? (
              <>{" "}You can <Link href={chatHref}>open the coordinator chat</Link> now.</>
            ) : null}
          </p>
        </div>
      ) : null}

      {error ? (
        <div className={`${styles.banner} ${styles.bannerError}`.trim()}>
          <p className={styles.bannerTitle}>Action failed</p>
          <p className={styles.bannerBody}>
            Please try again. ({error})
          </p>
        </div>
      ) : null}

      <p className={styles.tileBody} style={{ marginTop: "0.85rem" } as any}>
        {opportunity.summary}
      </p>

      {opportunity.tags?.length ? (
        <div className={styles.badges} aria-label="Tags">
          {opportunity.tags.map((t) => (
            <span key={t} className={styles.badge}>
              {t}
            </span>
          ))}
        </div>
      ) : null}

      <div className={styles.actionsRow}>
        {opportunity.saved ? (
          <form action={unsaveAction}>
            <button className={`${styles.button} ${styles.buttonDanger}`.trim()} type="submit">
              Unsave
            </button>
          </form>
        ) : (
          <form action={saveAction}>
            <button className={`${styles.button} ${styles.buttonPrimary}`.trim()} type="submit">
              Save
            </button>
          </form>
        )}

        {isOwn ? (
          <div className={`${styles.banner} ${styles.bannerInfo}`.trim()} role="status">
            <p className={styles.bannerTitle}>This is your request</p>
            <p className={styles.bannerBody}>You can’t submit an application to a request you created.</p>
          </div>
        ) : opportunity.application_id ? (
          <Link className={styles.button} href={`/volunteer/applications/${opportunity.application_id}`}>
            View application ({statusLabel(opportunity.application_status)})
          </Link>
        ) : null}

        {opportunity.requester_user_id ? (
          <Link className={styles.button} href={chatHref}>
            Message coordinator
          </Link>
        ) : null}
      </div>

      <div style={{ marginTop: "1.25rem" } as any}>
        <h3 id="apply" className={styles.sectionTitle}>Apply</h3>

        {isOwn ? (
          <div className={`${styles.banner} ${styles.bannerInfo}`.trim()} role="status">
            <p className={styles.bannerTitle}>This is your request</p>
            <p className={styles.bannerBody}>You can’t submit an application to a request you created.</p>
          </div>
        ) : opportunity.application_id ? (
          <div className={styles.banner}>
            <p className={styles.bannerTitle}>Already applied</p>
            <p className={styles.bannerBody}>
              Status: {statusLabel(opportunity.application_status)}
              {opportunity.application_created_at ? ` · Submitted: ${new Date(opportunity.application_created_at).toLocaleString()}` : ""}
              {opportunity.requester_user_id ? (
                <>{" "}· <Link href={chatHref}>Open coordinator chat</Link></>
              ) : null}
            </p>
          </div>
        ) : (
          <form className={styles.form} action={applyAction}>
            <label className={styles.small} htmlFor="message">
              Message (required)
            </label>
            <textarea
              id="message"
              name="message"
              className={styles.textarea}
              required
            />
            <button className={`${styles.button} ${styles.buttonPrimary}`.trim()} type="submit">
              Submit application
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
