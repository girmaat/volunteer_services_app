import { inOrg } from "../../../lib/access";
import { revalidatePath } from "next/cache";
import { backendFetch, getCurrentUser } from "../../lib/backend";
import { getOrgContext } from "../../lib/org";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Page(props: { searchParams?: Promise<{ saved?: string; error?: string }> }) {
  const searchParams = await props.searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!inOrg(user)) redirect("/dashboard");

  const ctx = await getOrgContext();
  if (!ctx) redirect("/org/signup");

  const org = ctx.org;
  const membership = ctx.membership;
  const orgSlug = org.slug;

  const canEdit = membership.role === "admin";

  async function saveProfileAction(formData: FormData) {
    "use server";
    const payload = {
      name: String(formData.get("name") || ""),
      summary: String(formData.get("summary") || ""),
      location: String(formData.get("location") || ""),
      mission: String(formData.get("mission") || "") || null,
      website_url: String(formData.get("website_url") || "") || null,
      contact_email: String(formData.get("contact_email") || "") || null,
      logo_url: String(formData.get("logo_url") || "") || null
    };

    const res = await backendFetch(`/v1/orgs/${encodeURIComponent(orgSlug)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    const json = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      const msg = encodeURIComponent(String(json?.message || "Failed to save organization settings"));
      redirect(`/org/settings?error=${msg}`);
    }

    revalidatePath("/org");
    redirect("/org/settings?saved=1");
  }

  async function changeSlugAction(formData: FormData) {
    "use server";
    const newSlug = String(formData.get("new_slug") || "").trim();

    const res = await backendFetch(`/v1/orgs/${encodeURIComponent(orgSlug)}/slug`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ new_slug: newSlug })
    });

    const json = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      const msg = encodeURIComponent(String(json?.message || "Failed to change slug"));
      redirect(`/org/settings?error=${msg}`);
    }

    revalidatePath("/org");
    redirect("/org/dashboard");
  }

  async function submitVerificationAction(formData: FormData) {
    "use server";
    const submission_notes = String(formData.get("submission_notes") || "").trim() || undefined;

    const res = await backendFetch(`/v1/orgs/${encodeURIComponent(orgSlug)}/verification/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ submission_notes })
    });

    const json = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      const msg = encodeURIComponent(String(json?.message || "Failed to submit verification"));
      redirect(`/org/settings?error=${msg}`);
    }

    revalidatePath("/org");
    redirect("/org/settings?saved=1");
  }

  const saved = searchParams?.saved === "1";
  const error = searchParams?.error ? decodeURIComponent(String(searchParams.error)) : "";

  const status = String(org.verification_status || "");
  const statusLabel =
    status === "approved" || status === "verified"
      ? "Verified"
      : status === "submitted"
        ? "Pending review"
        : status === "rejected"
          ? "Rejected"
          : org.verification_required
            ? "Required"
            : "Not verified";

  return (
    <div style={{ display: "grid", gap: 14, maxWidth: 900 }}>
      <header>
        <h1 style={{ margin: 0 }}>Organization settings</h1>
        <p style={{ marginTop: 6, color: "rgba(0,0,0,0.7)" }}>Manage your organization profile and verification.</p>
      </header>

      {saved ? (
        <div style={{ border: "1px solid rgba(0,120,0,0.35)", background: "rgba(0,120,0,0.05)", borderRadius: 12, padding: 12 }}>
          <strong>Saved.</strong>
        </div>
      ) : null}

      {error ? (
        <div style={{ border: "1px solid rgba(180,0,0,0.35)", background: "rgba(180,0,0,0.05)", borderRadius: 12, padding: 12 }}>
          <strong>Couldn&apos;t save changes.</strong>
          <div style={{ marginTop: 6 }}>{error}</div>
        </div>
      ) : null}

      <section style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: 14 }}>
        <h2 style={{ marginTop: 0 }}>Profile</h2>

        {!canEdit ? (
          <p style={{ margin: 0, color: "rgba(0,0,0,0.7)" }}>Only org admins can edit organization settings.</p>
        ) : (
          <form action={saveProfileAction} style={{ display: "grid", gap: 10 }}>
            <label style={{ display: "grid", gap: 6 }}>
              Display name
              <input name="name" defaultValue={org.name} required style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(0,0,0,0.25)" }} />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              Summary (one sentence)
              <input name="summary" defaultValue={org.summary} required style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(0,0,0,0.25)" }} />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              Location
              <input name="location" defaultValue={org.location} required style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(0,0,0,0.25)" }} />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              Mission (optional)
              <textarea name="mission" defaultValue={org.mission || ""} rows={4} style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(0,0,0,0.25)" }} />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              Website URL (optional)
              <input name="website_url" defaultValue={org.website_url || ""} style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(0,0,0,0.25)" }} />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              Contact email (optional)
              <input name="contact_email" defaultValue={org.contact_email || ""} style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(0,0,0,0.25)" }} />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              Logo URL (optional)
              <input name="logo_url" defaultValue={org.logo_url || ""} style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(0,0,0,0.25)" }} />
            </label>

            <button type="submit" style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.25)", background: "white", fontWeight: 800, width: 160 }}>
              Save
            </button>
          </form>
        )}
      </section>

      <section style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: 14 }}>
        <h2 style={{ marginTop: 0 }}>Organization slug</h2>
        <p style={{ marginTop: 6, color: "rgba(0,0,0,0.7)" }}>
          Current slug: <code>{org.slug}</code>
        </p>

        {!canEdit ? (
          <p style={{ margin: 0, color: "rgba(0,0,0,0.7)" }}>Only org admins can change the slug.</p>
        ) : (
          <form action={changeSlugAction} style={{ display: "grid", gap: 10, maxWidth: 420 }}>
            <label style={{ display: "grid", gap: 6 }}>
              New slug
              <input name="new_slug" placeholder="e.g. community-food-bank" required style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(0,0,0,0.25)" }} />
            </label>
            <button type="submit" style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.25)", background: "white", fontWeight: 800, width: 220 }}>
              Change slug
            </button>
          </form>
        )}
      </section>

      <section style={{ border: "1px solid rgba(0,0,0,0.12)", borderRadius: 12, padding: 14 }}>
        <h2 id="verification" style={{ marginTop: 0 }}>Verification</h2>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ fontWeight: 800 }}>Status:</div>
          <div style={{ padding: "4px 10px", borderRadius: 999, border: "1px solid rgba(0,0,0,0.18)", fontSize: 12 }}>{statusLabel}</div>
        </div>

        {org.verification_notes ? (
          <div style={{ marginTop: 10, padding: 10, borderRadius: 12, border: "1px solid rgba(0,0,0,0.12)", background: "rgba(0,0,0,0.02)" }}>
            <div style={{ fontSize: 12, color: "rgba(0,0,0,0.7)" }}>Reviewer notes</div>
            <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{org.verification_notes}</div>
          </div>
        ) : null}

        {!canEdit ? (
          <p style={{ marginTop: 10, color: "rgba(0,0,0,0.7)" }}>Only org admins can submit verification.</p>
        ) : status === "approved" || status === "verified" ? (
          <p style={{ marginTop: 10, color: "rgba(0,0,0,0.7)" }}>Your organization is verified.</p>
        ) : (
          <form action={submitVerificationAction} style={{ display: "grid", gap: 10, marginTop: 10, maxWidth: 720 }}>
            <label style={{ display: "grid", gap: 6 }}>
              Submission notes (optional)
              <textarea
                name="submission_notes"
                defaultValue={org.verification_submission_notes || ""}
                rows={5}
                placeholder="Add anything that helps verification (public website, EIN, contact person, etc.)"
                style={{ padding: 10, borderRadius: 10, border: "1px solid rgba(0,0,0,0.25)" }}
              />
            </label>

            <button type="submit" style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.25)", background: "white", fontWeight: 800, width: 220 }}>
              Submit for verification
            </button>
          </form>
        )}
      </section>
    </div>
  );
}