import Link from "next/link";
import { redirect } from "next/navigation";
import { API_BASE_URL_SERVER } from "@thankyou/config";
import authStyles from "../../(auth)/auth.module.css";
import styles from "./page.module.css";
import { backendFetch, getCurrentUser } from "../../lib/backend";
import OrgEnrollForm, { type OrgEnrollState } from "./OrgEnrollForm";

export const dynamic = "force-dynamic";

function safeMessage(err: any, fallback: string) {
  const msg = String(err?.message || err?.error || "").trim();
  return msg ? msg : fallback;
}

async function createOrgAction(formData: FormData) {
  "use server";

  const payload = {
    org: {
      name: String(formData.get("name") || "").trim(),
      slug: String(formData.get("slug") || "").trim(),
      summary: String(formData.get("summary") || "").trim(),
      location: String(formData.get("location") || "").trim(),
      mission: String(formData.get("mission") || "").trim() || null,
      website_url: String(formData.get("website_url") || "").trim() || null,
      contact_email: String(formData.get("contact_email") || "").trim() || null
    }
  };

  if (!payload.org.contact_email) {
    redirect(`/org/signup?error=${encodeURIComponent("Contact email is required to enable org joins.")}`);
  }

  const res = await backendFetch("/v1/orgs/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store"
  });

  if (res.status === 401) redirect("/login");

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    redirect(`/org/signup?error=${encodeURIComponent(safeMessage(err, "Create organization failed"))}`);
  }

  redirect("/org/onboarding");
}

async function joinOrgAction(formData: FormData) {
  "use server";

  const orgSlug = String(formData.get("orgSlug") || "").trim();
  if (!orgSlug) redirect(`/org/signup?error=${encodeURIComponent("Organization slug is required")}`);

  const res = await backendFetch("/v1/orgs/join", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orgSlug }),
    cache: "no-store"
  });

  if (res.status === 401) redirect("/login");

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    redirect(`/org/signup?error=${encodeURIComponent(safeMessage(err, "Join failed"))}`);
  }

  // After joining, route based on org onboarding completion.
  const me = await backendFetch("/v1/org/me", { method: "GET", cache: "no-store" });
  if (me.ok) {
    const ctx: any = await me.json().catch(() => null);
    const done = Boolean(ctx?.org?.onboarding_completed);
    redirect(done ? "/org/dashboard" : "/org/onboarding");
  }

  redirect("/org/onboarding");
}

async function enrollAction(prevState: OrgEnrollState, formData: FormData): Promise<OrgEnrollState> {
  "use server";

  const orgName = String(formData.get("orgName") || "").trim();
  const orgSlug = String(formData.get("orgSlug") || "").trim();
  const orgSummary = String(formData.get("orgSummary") || "").trim();
  const orgLocation = String(formData.get("orgLocation") || "").trim();
  const orgContactEmail = String(formData.get("orgContactEmail") || "").trim();
  const orgWebsiteUrl = String(formData.get("orgWebsiteUrl") || "").trim();
  const orgMission = String(formData.get("orgMission") || "").trim();

  const adminFullName = String(formData.get("adminFullName") || "").trim();
  const adminEmail = String(formData.get("adminEmail") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (!orgName || !orgSlug || !orgSummary || !orgLocation || !orgContactEmail) {
    return {
      view: "form",
      orgName,
      orgSlug,
      adminEmail,
      error: "Organization name, slug, summary, location, and contact email are required."
    };
  }

  if (!adminFullName || !adminEmail) {
    return {
      view: "form",
      orgName,
      orgSlug,
      adminEmail,
      error: "Admin name and email are required."
    };
  }

  if (password.length < 8) {
    return {
      view: "form",
      orgName,
      orgSlug,
      adminEmail,
      error: "Password must be at least 8 characters."
    };
  }

  if (password !== confirmPassword) {
    return {
      view: "form",
      orgName,
      orgSlug,
      adminEmail,
      error: "Passwords do not match."
    };
  }

  const res = await fetch(`${API_BASE_URL_SERVER}/v1/orgs/enroll`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      org: {
        name: orgName,
        slug: orgSlug,
        summary: orgSummary,
        location: orgLocation,
        contact_email: orgContactEmail,
        website_url: orgWebsiteUrl || null,
        mission: orgMission || null
      },
      admin: {
        fullName: adminFullName,
        email: adminEmail,
        password
      }
    }),
    cache: "no-store"
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return {
      view: "form",
      orgName,
      orgSlug,
      adminEmail,
      error: safeMessage(err, "Organization signup failed")
    };
  }

  const data = await res.json().catch(() => ({}));
  return {
    view: "sent",
    orgName,
    orgSlug,
    adminEmail,
    delivery: String(data?.emailDelivery || ""),
    verifyUrl: String(data?.dev_verify_url || ""),
    info: "Check your inbox to verify your admin email address."
  };
}

export default async function Page(props: { searchParams?: Promise<{ error?: string }> }) {
  const searchParams = await props.searchParams;
  const user = await getCurrentUser();
  const error = searchParams?.error ? String(searchParams.error) : "";

  // If an org user already has org context, skip this page.
  if (user) {
    const accountType = String((user as any).account_type || "");
    const isOrgTeamMember = user.role === "org_admin" || accountType === "org_team_member";

    if (isOrgTeamMember) {
      const orgRes = await backendFetch("/v1/org/me", { method: "GET", cache: "no-store" });
      if (orgRes.ok) {
        const ctx: any = await orgRes.json().catch(() => null);
        const done = Boolean(ctx?.org?.onboarding_completed);
        redirect(done ? "/org/dashboard" : "/org/onboarding");
      }
    }
  }

  return (
    <section className={authStyles.page}>
      <header className={authStyles.header}>
        <h1 className={authStyles.title}>Organization setup</h1>
        <p className={authStyles.subtitle}>
          Create a new organization or join an existing one. This page is intentionally accessible even when org context
          is missing.
        </p>
      </header>

      <div className={styles.pageTight}>
        {error ? <p className={styles.error}>{error}</p> : null}

        {user ? (
          <div className={styles.stack}>
            <div className={styles.note}>
              Signed in as <strong>{user.email}</strong>.{" "}
              <Link className={styles.link} href="/settings">
                Account settings
              </Link>
            </div>

            {user.role === "requester" && String((user as any).requester_mode || "") !== "organization" ? (
              <div className={styles.card}>
                <h2 className={styles.h2}>Not an org requester yet</h2>
                <p className={styles.note}>
                  To create or join an organization, choose <strong>Requester (Organization)</strong> in onboarding.
                </p>
                <Link className={styles.link} href="/onboarding">
                  Go to onboarding
                </Link>
              </div>
            ) : null}

            {!user.profile_completed ? (
              <div className={styles.card}>
                <h2 className={styles.h2}>Complete your profile first</h2>
                <p className={styles.note}>Finish your personal profile so we can create or join your organization.</p>
                <Link className={styles.link} href="/onboarding">
                  Continue onboarding
                </Link>
              </div>
            ) : null}

            <div className={styles.twoCol}>
              <div className={styles.card}>
                <h2 className={styles.h2}>Create organization</h2>
                <p className={styles.note}>
                  Create a new organization and become its admin. After creation you will continue to org onboarding.
                </p>

                <form action={createOrgAction} className={styles.stack}>
                  <label className={styles.field}>
                    Organization name
                    <input name="name" required minLength={2}  className={authStyles.input} />
                  </label>

                  <label className={styles.field}>
                    Organization slug
                    <input name="slug" required minLength={2} placeholder="e.g. city-food-bank"  className={authStyles.input} />
                  </label>

                  <label className={styles.field}>
                    Summary
                    <textarea name="summary" required minLength={10} rows={3}  className={authStyles.textarea} />
                  </label>

                  <label className={styles.field}>
                    Location
                    <input name="location" required minLength={2} placeholder="City, State"  className={authStyles.input} />
                  </label>

                  <label className={styles.field}>
                    Contact email (used for domain-based joins)
                    <input name="contact_email" type="email" required  className={authStyles.input} />
                  </label>

                  <label className={styles.field}>
                    Website URL (optional)
                    <input name="website_url" type="url" placeholder="https://example.org"  className={authStyles.input} />
                  </label>

                  <label className={styles.field}>
                    Mission (optional)
                    <input name="mission"  className={authStyles.input} />
                  </label>

                  <div className={styles.submitRow}>
                    <button className={authStyles.button} type="submit" disabled={!user.profile_completed}>
                      Create organization
                    </button>
                  </div>
                </form>
              </div>

              <div className={styles.card}>
                <h2 className={styles.h2}>Join organization</h2>
                <p className={styles.note}>
                  Join an existing organization if your email domain matches the organization&apos;s contact email domain
                  (or website domain). If you need access but domains don&apos;t match, ask an admin to add you.
                </p>

                <form action={joinOrgAction} className={styles.stack}>
                  <label className={styles.field}>
                    Organization slug
                    <input name="orgSlug" required minLength={2} placeholder="e.g. city-food-bank"  className={authStyles.input} />
                  </label>

                  <div className={styles.submitRow}>
                    <button className={authStyles.button} type="submit" disabled={!user.profile_completed}>
                      Join organization
                    </button>
                  </div>
                </form>
              </div>
            </div>

            <div className={styles.note}>
              Want an individual volunteer/requester account instead?{" "}
              <Link className={styles.link} href="/onboarding">
                Go to onboarding
              </Link>
            </div>
          </div>
        ) : (
          <div className={styles.stack}>
            <div className={styles.card}>
              <p className={styles.note}>
                Already have an account? <Link className={styles.link} href="/login">Log in</Link> to create or join an organization
                from your existing profile.
              </p>
            </div>

            <OrgEnrollForm action={enrollAction} />
          </div>
        )}
      </div>
    </section>
  );
}
