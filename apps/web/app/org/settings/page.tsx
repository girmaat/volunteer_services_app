import { inOrg } from "../../../lib/access";
import { revalidatePath } from "next/cache";
import { backendFetch, getCurrentUser } from "../../lib/backend";
import { getOrgContext } from "../../lib/org";
import { redirect } from "next/navigation";
import { Button, Card, Notice, PageHeader, VerifiedBadge } from "../../../components/ui";
import OrgTabs from "../../../components/org/OrgTabs";
import { ORG_TYPE_LABEL, ORG_TYPES } from "@volunteer_services_app/contracts";

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
      preferred_skills: String(formData.get("preferred_skills") || ""),
      service_area: String(formData.get("service_area") || "") || null,
      hours: String(formData.get("hours") || "") || null,
      contact_phone: String(formData.get("contact_phone") || "") || null,
      preferred_contact_method: String(formData.get("preferred_contact_method") || "") || null,
      org_type: String(formData.get("org_type") || "") || undefined
    };

    const res = await backendFetch(`/v1/orgs/${encodeURIComponent(orgSlug)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    const json = (await res.json().catch(() => ({}))) as { message?: string; [key: string]: unknown };
    if (!res.ok) {
      const msg = encodeURIComponent(String(json?.message || "Failed to save organization settings"));
      redirect(`/org/settings?error=${msg}`);
    }

    revalidatePath("/org");
    redirect("/org/settings?saved=1");
  }

  async function uploadLogoAction(formData: FormData) {
    "use server";
    const file = formData.get("logo");
    if (formData.get("remove") === "1") {
      const r = await backendFetch(`/v1/orgs/${encodeURIComponent(orgSlug)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ logo_url: null }) });
      redirect(r.ok ? "/org/settings?saved=1" : `/org/settings?error=${encodeURIComponent("Couldn't remove the logo")}`);
    }
    if (!file || !(file instanceof File) || !file.size) redirect(`/org/settings?error=${encodeURIComponent("Choose an image")}`);
    const payload = new FormData();
    payload.set("file", file, file.name);
    const res = await backendFetch(`/v1/orgs/${encodeURIComponent(orgSlug)}/logo`, { method: "POST", body: payload });
    const json = (await res.json().catch(() => ({}))) as { message?: string; [key: string]: unknown };
    if (!res.ok) redirect(`/org/settings?error=${encodeURIComponent(String(json?.message || "Upload failed"))}`);
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

    const json = (await res.json().catch(() => ({}))) as { message?: string; [key: string]: unknown };
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

    const json = (await res.json().catch(() => ({}))) as { message?: string; [key: string]: unknown };
    if (!res.ok) {
      const msg = encodeURIComponent(String(json?.message || "Failed to submit verification"));
      redirect(`/org/settings?error=${msg}`);
    }

    revalidatePath("/org");
    redirect("/org/settings?saved=1");
  }

  async function savePolicyAction(formData: FormData) {
    "use server";
    const policy = String(formData.get("publication_policy") || "");
    const res = await backendFetch(`/v1/orgs/${encodeURIComponent(orgSlug)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ publication_policy: policy })
    });
    if (!res.ok) redirect(`/org/settings?error=${encodeURIComponent("The publishing rule didn’t save.")}#publishing`);
    redirect("/org/settings?saved=1#publishing");
  }

  const saved = searchParams?.saved === "1";
  const error = searchParams?.error ? decodeURIComponent(String(searchParams.error)) : "";

  const status = String(org.verification_status || "");
  const statusLabel =
    status === "approved" || status === "verified"
      ? "Verified"
      : status === "submitted"
        ? "Being reviewed"
        : status === "needs_info"
          ? "More information needed"
          : status === "rejected"
            ? "Declined: you can update and resubmit"
            : status === "suspended"
              ? "Suspended"
              : "Not verified yet";

  const label = "grid gap-1.5 text-sm font-medium text-ink";
  const input = "h-11 w-full rounded border border-line-strong bg-surface px-3 text-base font-normal";
  const area = "min-h-[96px] w-full rounded border border-line-strong bg-surface px-3 py-2.5 text-base font-normal";
  const hint = "text-xs font-normal text-muted";
  const verified = status === "approved" || status === "verified";

  return (
    <div className="grid max-w-3xl gap-6">
      <PageHeader title="Organization settings" description="Your public profile, how volunteers reach you, and verification." />
      <OrgTabs role={ctx?.membership.role} />
      {saved ? <Notice tone="success">Saved.</Notice> : null}
      {error ? <Notice tone="danger">Couldn&apos;t save changes: {error}</Notice> : null}

      <Card>
        <h2 className="m-0 mb-4 text-lg">Profile</h2>
        {!canEdit ? (
          <p className="m-0 text-muted">Only organization admins can edit these settings.</p>
        ) : (
          <>
          <form action={saveProfileAction} className="grid gap-4">
            <label className={label}>
              Name
              <input name="name" defaultValue={org.name} required className={input} />
            </label>
            <label className={label}>
              Summary <span className={hint}>One sentence shown in search results.</span>
              <input name="summary" defaultValue={org.summary} required className={input} />
            </label>
            <label className={label}>
              Type of organization <span className={hint}>Schools can add school coordinators to their team.</span>
              <select name="org_type" defaultValue={org.org_type || "nonprofit"} className={input}>
                {ORG_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {ORG_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              Mission <span className={hint}>(optional)</span>
              <textarea name="mission" defaultValue={org.mission || ""} className={area} />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={label}>
                City or region
                <input name="location" defaultValue={org.location} required className={input} />
              </label>
              <label className={label}>
                Service area <span className={hint}>Neighborhoods or &ldquo;Remote&rdquo;</span>
                <input name="service_area" defaultValue={org.service_area || ""} placeholder="Queens and Brooklyn" className={input} />
              </label>
            </div>
            <label className={label}>
              Skills you often need <span className={hint}>Comma-separated; used to suggest your requests to volunteers.</span>
              <input name="preferred_skills" defaultValue={(org.preferred_skills || []).join(", ")} placeholder="driving, spanish, food handling" className={input} />
            </label>
            <label className={label}>
              Hours <span className={hint}>(optional)</span>
              <input name="hours" defaultValue={org.hours || ""} placeholder="Tue–Sat, 9am–5pm" className={input} />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={label}>
                Website <span className={hint}>(optional)</span>
                <input name="website_url" type="url" defaultValue={org.website_url || ""} className={input} />
              </label>

            </div>
            <fieldset className="m-0 grid gap-3 rounded border border-line p-4">
              <legend className="px-1 text-sm font-medium">Contact (never shown publicly)</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={label}>
                  Contact email
                  <input name="contact_email" type="email" defaultValue={org.contact_email || ""} className={input} />
                </label>
                <label className={label}>
                  Phone <span className={hint}>(optional)</span>
                  <input name="contact_phone" type="tel" defaultValue={org.contact_phone || ""} className={input} />
                </label>
              </div>
              <label className={label}>
                Volunteers should reach you by
                <select name="preferred_contact_method" defaultValue={org.preferred_contact_method || "in_app"} className={input}>
                  <option value="in_app">Messages in Volunteer Services</option>
                  <option value="email">Email, after they&apos;re accepted</option>
                  <option value="phone">Phone, after they&apos;re accepted</option>
                </select>
              </label>
            </fieldset>
            <div>
              <Button type="submit">Save profile</Button>
            </div>
          </form>
          <form action={uploadLogoAction} className="mt-6 flex flex-wrap items-end gap-3 border-t border-line pt-4">
            {org.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={org.logo_url} alt="Current logo" width={48} height={48} className="h-12 w-12 rounded border border-line object-contain" />
            ) : null}
            <label className={label}>
              Logo <span className={hint}>PNG, JPEG or WebP, up to 1 MB</span>
              <input name="logo" type="file" accept="image/png,image/jpeg,image/webp" className="text-sm" />
            </label>
            <button type="submit" className="h-10 rounded-md border border-line bg-surface px-3 font-semibold">
              Upload logo
            </button>
            {org.logo_url ? (
              <button type="submit" name="remove" value="1" className="h-10 rounded-md border border-line px-3">
                Remove
              </button>
            ) : null}
          </form>
          </>
        )}
      </Card>

      <Card>
        <h2 id="verification" className="m-0 mb-2 flex items-center gap-2 text-lg">
          Verification {verified ? <VerifiedBadge /> : <span className="text-sm font-normal text-muted">· {statusLabel}</span>}
        </h2>
        <p className="m-0 text-sm text-muted">
          Only verified organizations can publish requests and approve volunteer hours. You can write drafts while you wait. Verified organizations also get a badge and can post in sensitive categories.
        </p>
        {org.suspended_at ? (
          <div className="mt-3">
            <Notice tone="danger">
              Suspended{org.suspended_reason ? `: ${org.suspended_reason}` : "."} Your requests are hidden and hours can’t be approved. Reply to the email from Volunteer Services to ask for a review.
            </Notice>
          </div>
        ) : null}
        {org.verification_notes ? (
          <div className="mt-3">
            <Notice tone="info">Reviewer notes: {org.verification_notes}</Notice>
          </div>
        ) : null}
        {!canEdit || verified || status === "suspended" ? null : (
          <form action={submitVerificationAction} className="mt-4 grid gap-3">
            <label className={label}>
              Notes for the reviewer <span className={hint}>(public website, EIN, a contact person…)</span>
              <textarea name="submission_notes" defaultValue={org.verification_submission_notes || ""} className={area} />
            </label>
            <div>
              <Button type="submit" variant="secondary">
                {status === "submitted" ? "Update submission" : status === "needs_info" || status === "rejected" ? "Send for another review" : "Submit for verification"}
              </Button>
            </div>
          </form>
        )}
      </Card>

      <Card>
        <h2 id="publishing" className="m-0 mb-2 text-lg">
          Who can publish requests
        </h2>
        <p className="m-0 text-sm text-muted">Admins (owners) always publish directly. Choose when managers need an owner to approve first.</p>
        {canEdit ? (
          <form action={savePolicyAction} className="mt-4 grid gap-3">
            {[
              ["owner_first_and_high_risk", "The organization’s first request, and high-risk ones (recommended)", "High-risk: sensitive categories, under-18 consent or a background check."],
              ["owner_all", "Every request", "An owner approves everything before it goes public."],
              ["delegated", "None: managers publish on their own", "Use when your managers are experienced."]
            ].map(([v, l, h]) => (
              <label key={v} className="flex items-start gap-3 text-sm">
                <input type="radio" name="publication_policy" value={v} defaultChecked={(org.publication_policy || "owner_first_and_high_risk") === v} className="mt-0.5 h-5 w-5 accent-[var(--primary)]" />
                <span>
                  <span className="font-medium">{l}</span>
                  <span className="block text-muted">{h}</span>
                </span>
              </label>
            ))}
            <div>
              <Button type="submit" variant="secondary">
                Save
              </Button>
            </div>
          </form>
        ) : (
          <p className="m-0 mt-2 text-sm">
            {org.publication_policy === "delegated" ? "Managers publish on their own." : org.publication_policy === "owner_all" ? "An owner approves every request." : "An owner approves the first request and high-risk ones."}
          </p>
        )}
      </Card>

      <Card>
        <h2 className="m-0 mb-2 text-lg">Web address</h2>
        <p className="m-0 text-sm text-muted">
          Your public page is <code>/organizations/{org.slug}</code>. Changing it breaks links you&apos;ve already shared.
        </p>
        {canEdit ? (
          <form action={changeSlugAction} className="mt-4 flex flex-wrap items-end gap-3">
            <label className={label}>
              New address
              <input name="new_slug" placeholder="community-food-bank" required pattern="[a-z0-9-]{3,60}" className={input} />
            </label>
            <Button type="submit" variant="secondary">
              Change address
            </Button>
          </form>
        ) : null}
      </Card>
    </div>
  );
}
