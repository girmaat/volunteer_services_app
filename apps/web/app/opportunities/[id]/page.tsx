import styles from "./page.module.css";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getPublicOpportunity } from "../../../lib/public-api";
import { backendFetch, getCurrentUser } from "../../lib/backend";

export const dynamic = "force-dynamic";

type OpportunityDetail = {
  id: string;
  title: string;
  summary?: string;
  description?: string;
  location?: string;
  location_text?: string;
  mode?: string;
  updated_at?: string;
  organization_name?: string | null;
  tags?: string[] | null;
  saved?: boolean;
  application_id?: string | null;
  application_status?: string | null;
  application_message?: string | null;
  application_created_at?: string | null;
  requester_user_id?: string | null;
};

type RequesterRequestDetail = {
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

type RequesterApplicationRow = {
  id: string;
  request_id: string;
  status: "pending" | "accepted" | "rejected" | "withdrawn" | "confirmed" | "completed" | string;
  message: string | null;
  created_at: string;
  updated_at: string;
  volunteer_user_id: string;
  volunteer_display_name: string | null;
  volunteer_avatar_url: string | null;
  volunteer_public_location: string | null;
  volunteer_bio: string | null;
  volunteer_verification_status: string | null;
};

function formatUpdated(updatedAt?: string) {
  if (!updatedAt) return "—";
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString();
}

function formatDateTime(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function modeLabel(m?: string | null) {
  const raw = String(m || "").toLowerCase();
  if (raw === "in-person" || raw === "in_person") return "In-person";
  if (raw === "remote") return "Remote";
  if (raw === "hybrid") return "Hybrid";
  return m ? String(m) : "—";
}

function requestStatusLabel(s?: string | null) {
  const raw = String(s || "").toLowerCase();
  if (raw === "open") return "Open";
  if (raw === "paused") return "Paused";
  if (raw === "closed") return "Closed";
  return s ? String(s) : "—";
}

function appStatusLabel(s: string) {
  const raw = String(s || "").toLowerCase();
  if (raw === "pending") return "Pending";
  if (raw === "accepted") return "Accepted";
  if (raw === "rejected") return "Rejected";
  if (raw === "withdrawn") return "Withdrawn";
  if (raw === "confirmed") return "Confirmed";
  if (raw === "completed") return "Completed";
  return s;
}

export default async function OpportunityDetailPage(
  props: {
    params: Promise<{ id: string }>;
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const id = decodeURIComponent(params.id);

  const me = await getCurrentUser().catch(() => null);

  if (!me) {
    const pub = await getPublicOpportunity(id);
    if (!pub) notFound();
    return (
      <section className={styles.page}>
        <header className={styles.header}>
          <div>
            <div className={styles.kicker}>Volunteer Opportunity</div>
            <h1 className={styles.title}>{pub.title}</h1>
            <p className={styles.meta}>
              {modeLabel(pub.mode)} · {pub.location}
              {pub.organization_name ? ` · ${pub.organization_name}${pub.organization_verified ? " (verified)" : ""}` : ""}
            </p>
          </div>
          <div className={styles.actions}>
            <Link className={styles.primary} href={`/login?returnTo=${encodeURIComponent(`/opportunities/${pub.id}`)}`}>
              Sign in to apply
            </Link>
            <Link className={styles.secondary} href="/signup">
              Create account
            </Link>
          </div>
        </header>

        <div className={styles.card}>
          <div className={styles.cardTitle}>About this opportunity</div>
          <div className={styles.body}>{pub.summary}</div>
          {pub.tags.length ? <div className={styles.meta}>Tags: {pub.tags.join(", ")}</div> : null}
          {pub.needed_by ? <div className={styles.meta}>Needed by {new Date(pub.needed_by).toLocaleDateString()}</div> : null}
          <div className={styles.meta}>Exact location and contact details are shared after your application is accepted.</div>
        </div>
      </section>
    );
  }

  // Volunteers use the richer volunteer UI; requesters can apply here.
  if (me.role === "volunteer") {
    redirect(`/volunteer/opportunities/${encodeURIComponent(id)}`);
  }

  const applied = String(searchParams?.applied || "").trim() === "1";
  const err = String(searchParams?.error || "").trim();

  const detailPath = me.role === "requester"
    ? `/v1/volunteer/opportunities/${encodeURIComponent(id)}`
    : `/v1/public/opportunities/${encodeURIComponent(id)}`;

  const detailRes = await backendFetch(detailPath, { method: "GET" });
  if (!detailRes.ok) {
    if (detailRes.status === 404) {
      return (
        <section className={styles.page}>
          <header className={styles.header}>
            <div>
              <div className={styles.kicker}>Volunteer Opportunity</div>
              <h1 className={styles.title}>Opportunity not found</h1>
              <p className={styles.meta}>This opportunity may have been closed or removed.</p>
            </div>
            <div className={styles.actions}>
              <Link className={styles.secondary} href="/opportunities">
                Back to opportunities
              </Link>
            </div>
          </header>
        </section>
      );
    }

    return (
      <section className={styles.page}>
        <header className={styles.header}>
          <div>
            <div className={styles.kicker}>Volunteer Opportunity</div>
            <h1 className={styles.title}>Couldn&apos;t load opportunity</h1>
            <p className={styles.meta}>HTTP {detailRes.status}</p>
          </div>
          <div className={styles.actions}>
            <Link className={styles.secondary} href="/opportunities">
              Back to opportunities
            </Link>
          </div>
        </header>
      </section>
    );
  }

  const opportunity = (await detailRes.json()) as OpportunityDetail;

  const tagList = Array.isArray(opportunity.tags) ? opportunity.tags : [];
  const description = String(opportunity.summary || opportunity.description || "");
  const canApply = me.role === "requester";
  const alreadyApplied = canApply && Boolean(opportunity.application_id);
  const isOwn =
    canApply &&
    Boolean(opportunity.requester_user_id) &&
    String(opportunity.requester_user_id) === String((me as any).id);

  // If this is your own request, show requester-facing request + application metadata.
  let myRequest: RequesterRequestDetail | null = null;
  let myApps: RequesterApplicationRow[] = [];

  if (isOwn) {
    const reqRes = await backendFetch(`/v1/requester/requests/${encodeURIComponent(id)}`, { method: "GET" });
    if (reqRes.ok) {
      myRequest = (await reqRes.json()) as RequesterRequestDetail;

      const appsRes = await backendFetch(`/v1/requester/requests/${encodeURIComponent(id)}/applications`, { method: "GET" });
      if (appsRes.ok) {
        myApps = (await appsRes.json()) as RequesterApplicationRow[];
      }
    }
  }

  const appsTotal = myApps.length;
  const appsPending = myApps.reduce((acc, a) => acc + (String(a.status) === "pending" ? 1 : 0), 0);
  const appsActive = myApps.reduce(
    (acc, a) => acc + (["accepted", "confirmed"].includes(String(a.status)) ? 1 : 0),
    0
  );
  const appsConfirmed = myApps.reduce((acc, a) => acc + (String(a.status) === "confirmed" ? 1 : 0), 0);
  const appsCompleted = myApps.reduce((acc, a) => acc + (String(a.status) === "completed" ? 1 : 0), 0);

  async function applyAction(formData: FormData) {
    "use server";

    const me2 = await getCurrentUser().catch(() => null);
    if (!me2 || me2.role !== "requester") {
      redirect(
        `/opportunities/${encodeURIComponent(id)}?error=${encodeURIComponent(
          "Only requesters can apply from this page."
        )}#apply`
      );
    }

    const message = String(formData.get("message") || "").trim();
    if (!message)
      redirect(
        `/opportunities/${encodeURIComponent(id)}?error=${encodeURIComponent(
          "Please add a short message."
        )}#apply`
      );

    const res = await backendFetch(`/v1/volunteer/opportunities/${encodeURIComponent(id)}/apply`, {
      method: "POST",
      body: JSON.stringify({ message })
    });

    if (res.ok) {
      redirect(`/opportunities/${encodeURIComponent(id)}?applied=1#apply`);
    }

    let msg = `Failed to apply (HTTP ${res.status}).`;
    try {
      const body = (await res.json()) as any;
      if (body?.message) msg = String(body.message);
    } catch {
      // ignore
    }

    redirect(`/opportunities/${encodeURIComponent(id)}?error=${encodeURIComponent(msg)}#apply`);
  }

  const manageHref = `/requester/requests/${encodeURIComponent(id)}`;
  const appsHref = `/requester/requests/${encodeURIComponent(id)}/applications`;

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <div className={styles.kicker}>Volunteer Opportunity</div>
          <h1 className={styles.title}>{String(opportunity.title || "Opportunity")}</h1>
          <div className={styles.meta}>
            {String(opportunity.mode || "remote")} · {String(opportunity.location || opportunity.location_text || "—")} · Updated{" "}
            {formatUpdated(opportunity.updated_at)}
            {opportunity.organization_name ? ` · Hosted by ${opportunity.organization_name}` : ""}
          </div>
        </div>
        <div className={styles.actions}>
          <Link className={styles.secondary} href="/opportunities">
            Back to opportunities
          </Link>

          {isOwn ? (
            <>
              <Link className={styles.primary} href={appsHref}>
                View applications
              </Link>
              <Link className={styles.secondary} href={manageHref}>
                Manage request
              </Link>
            </>
          ) : canApply ? (
            <Link className={styles.primary} href="#apply">
              Apply to help
            </Link>
          ) : null}
        </div>
      </header>

      {err ? (
        <div className={styles.alert} role="alert">
          {err}
        </div>
      ) : null}
      {applied ? (
        <div className={styles.success} role="status">
          Application submitted. You can track it from your Requests dashboard.
        </div>
      ) : null}

      <div className={styles.grid}>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Details</h2>
          <div className={styles.body}>{description || "—"}</div>

          {tagList.length ? (
            <div className={styles.pillRow} aria-label="Tags">
              {tagList.map((t) => (
                <span key={String(t)} className={styles.pill}>
                  {String(t)}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className={styles.card} id="apply">
          {isOwn ? (
            <>
              <h2 className={styles.cardTitle}>Your request</h2>

              <div className={styles.pillRow} aria-label="Request status">
                <span className={styles.pill}>Status: {requestStatusLabel(myRequest?.status || null)}</span>
                <span className={styles.pill}>Applications: {appsTotal}</span>
              </div>

              <div className={styles.kvList}>
                <div className={styles.kvRow}>
                  <div className={styles.kvLabel}>Needed by</div>
                  <div className={styles.kvValue}>{formatDateTime(myRequest?.needed_by)}</div>
                </div>
                <div className={styles.kvRow}>
                  <div className={styles.kvLabel}>Mode</div>
                  <div className={styles.kvValue}>{modeLabel(myRequest?.mode || opportunity.mode || null)}</div>
                </div>
                <div className={styles.kvRow}>
                  <div className={styles.kvLabel}>Location</div>
                  <div className={styles.kvValue}>{String(myRequest?.location || opportunity.location || opportunity.location_text || "—")}</div>
                </div>
                <div className={styles.kvRow}>
                  <div className={styles.kvLabel}>Last updated</div>
                  <div className={styles.kvValue}>{formatUpdated(myRequest?.updated_at || opportunity.updated_at)}</div>
                </div>
              </div>

              <div className={styles.divider} />

              <div className={styles.sectionTitle}>Applications</div>
              <div className={styles.pillRow} aria-label="Application summary">
                <span className={styles.pill}>Pending {appsPending}</span>
                <span className={styles.pill}>Active {appsActive}</span>
                <span className={styles.pill}>Confirmed {appsConfirmed}</span>
                <span className={styles.pill}>Completed {appsCompleted}</span>
              </div>

              {appsTotal === 0 ? (
                <div className={styles.helperText} style={{ marginTop: 10 }}>
                  No one has applied yet. You&apos;ll see applicants here as they come in.
                </div>
              ) : (
                <div className={styles.appList} aria-label="Recent applications">
                  {myApps.slice(0, 4).map((a) => {
                    const name = a.volunteer_display_name || "Volunteer";
                    const where = a.volunteer_public_location || "";
                    const verified = String(a.volunteer_verification_status || "") === "approved";
                    return (
                      <div key={a.id} className={styles.appItem}>
                        <div className={styles.appTop}>
                          <div>
                            <div className={styles.appName}>
                              {name}
                              {verified ? <span className={styles.appBadge}>Verified</span> : null}
                            </div>
                            <div className={styles.appMeta}>
                              {where ? `${where} · ` : ""}{appStatusLabel(String(a.status))} · {formatUpdated(a.created_at)}
                            </div>
                          </div>
                        </div>

                        <div className={styles.appActionsRow}>
                          <Link className={styles.secondarySmall} href={`/volunteers/${encodeURIComponent(a.volunteer_user_id)}`}>
                            View profile
                          </Link>
                          <Link
                            className={styles.primarySmall}
                            href={`/requester/messages/${encodeURIComponent(a.volunteer_user_id)}?requestId=${encodeURIComponent(id)}&applicationId=${encodeURIComponent(a.id)}`}
                          >
                            Message
                          </Link>
                        </div>
                      </div>
                    );
                  })}

                  <div className={styles.appFooter}>
                    <Link className={styles.primary} href={appsHref}>
                      View all applications
                    </Link>
                  </div>
                </div>
              )}

              <div className={styles.divider} />

              <div className={styles.actions} style={{ marginTop: 6 }}>
                <Link className={styles.secondary} href={manageHref}>
                  Edit request
                </Link>
              </div>
            </>
          ) : (
            <>
              <h2 className={styles.cardTitle}>Apply</h2>

              {!canApply ? (
                <div className={styles.alert} role="alert">
                  Only requesters can apply from this page.
                </div>
              ) : null}

              {alreadyApplied ? (
                <div className={styles.success} role="status">
                  You already applied ({String(opportunity.application_status || "pending")}).
                </div>
              ) : null}

              <form action={applyAction}>
                <label className={styles.fieldLabel} htmlFor="message">
                  Message
                </label>
                <textarea
                  id="message"
                  name="message"
                  className={styles.textarea}
                  placeholder="Share why you want to help, relevant experience, and availability."
                  required
                  maxLength={5000}
                  disabled={alreadyApplied || !canApply}
                />
                <div className={styles.helperText}>Your message is shared with the requester / organization.</div>

                <div className={styles.submitRow}>
                  <div className={styles.helperText}>Max 5000 characters.</div>
                  <button className={styles.submitBtn} type="submit" disabled={alreadyApplied || !canApply}>
                    Submit application
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </section>
  );
}


