import PhotoUpload from "../../../components/profile/PhotoUpload";
import ProfileTabs from "../../../components/shell/ProfileTabs";
import Link from "next/link";
import { redirect } from "next/navigation";
import { backendFetch, getCurrentUser, getVolunteerProfile, getMyShareModerationSummary } from "../../lib/backend";
import styles from "../volunteer.module.css";

export const dynamic = "force-dynamic";

function initialsFrom(nameOrEmail: string) {
  const raw = (nameOrEmail || "").trim();
  if (!raw) return "?";
  if (raw.includes("@")) return raw[0]?.toUpperCase() || "?";
  const parts = raw.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || "";
  const second = parts.length > 1 ? parts[parts.length - 1]?.[0] || "" : "";
  const out = (first + second).toUpperCase();
  return out || "?";
}

export default async function Page(
  props: {
    searchParams?: Promise<{ saved?: string; error?: string; setup?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const profile = await getVolunteerProfile();
  const moderation = await getMyShareModerationSummary();

  async function saveProfile(formData: FormData) {
    "use server";

    const fullName = String(formData.get("fullName") || "").trim();
    const phoneRaw = String(formData.get("phone") || "").trim();

    const displayNameRaw = String(formData.get("displayName") || "").trim();
    const publicLocationRaw = String(formData.get("publicLocation") || "").trim();
    const serviceRadiusMilesRaw = String(formData.get("serviceRadiusMiles") || "").trim();

    const bioRaw = String(formData.get("bio") || "").trim();
    const languagesRaw = String(formData.get("languages") || "").trim();
    const interactionStylesRaw = String(formData.get("interactionStyles") || "").trim();

    const parseCsv = (raw: string) =>
      raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

    if (!fullName) {
      redirect("/volunteer/profile?error=" + encodeURIComponent("Full name is required."));
    }

    const payload: any = {};

    payload.fullName = fullName;

    payload.phone = phoneRaw ? phoneRaw : null;
    payload.displayName = displayNameRaw ? displayNameRaw : null;
    payload.publicLocation = publicLocationRaw ? publicLocationRaw : null;

    const birthDateRaw = String(formData.get("birthDate") || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(birthDateRaw)) payload.birthDate = birthDateRaw;

    const radiusNum = serviceRadiusMilesRaw ? Number(serviceRadiusMilesRaw) : NaN;
    payload.serviceRadiusMiles = Number.isFinite(radiusNum) ? Math.min(Math.max(Math.floor(radiusNum), 1), 200) : null;

    payload.bio = bioRaw ? bioRaw : null;

    payload.languages = languagesRaw ? parseCsv(languagesRaw) : [];
    payload.interactionStyles = interactionStylesRaw ? parseCsv(interactionStylesRaw) : [];

    const res = await backendFetch("/v1/volunteer/profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as any;
      const msg = data?.message || "Failed to save profile.";
      redirect("/volunteer/profile?error=" + encodeURIComponent(msg));
    }

    redirect("/volunteer/profile?saved=1");
  }

  const displayName = (profile?.display_name || profile?.full_name || user.email || "").trim();
  const avatarText = initialsFrom(displayName);
  const publicUrl = `/volunteers/${user.id}`;

  return (
    <>
      <h1 className={styles.sectionTitle}>Profile</h1>
      <ProfileTabs roles={user?.roles ?? []} setup={searchParams?.setup === "1"} role="volunteer" />

      {searchParams?.saved ? (
        <div className={`${styles.banner} ${styles.bannerSuccess}`}>
          <p className={styles.bannerTitle}>Saved</p>
          <p className={styles.bannerBody}>Your profile changes were saved.</p>
        </div>
      ) : null}

      {searchParams?.error ? (
        <div className={`${styles.banner} ${styles.bannerError}`}>
          <p className={styles.bannerTitle}>Could not save</p>
          <p className={styles.bannerBody}>{searchParams.error}</p>
        </div>
      ) : null}

      {moderation?.share_creation_restricted ? (
        <div className={`${styles.banner} ${styles.bannerError}`.trim()}>
          <p className={styles.bannerTitle}>Sharing temporarily restricted</p>
          <p className={styles.bannerBody}>
            We&apos;ve paused new share links on your account because {moderation.reports_last_30d} report(s) were submitted about
            links you shared in the last 30 days. Review what you shared and revoke any link that shouldn&apos;t be active.
          </p>
        </div>
      ) : moderation?.auto_revoked_links ? (
        <div className={`${styles.banner} ${styles.bannerWarning}`.trim()}>
          <p className={styles.bannerTitle}>Some shared links were revoked</p>
          <p className={styles.bannerBody}>
            {moderation.auto_revoked_links} of your shared links were automatically revoked after multiple reports. Repeated reports
            may restrict sharing.
          </p>
        </div>
      ) : moderation?.reported_links ? (
        <div className={`${styles.banner} ${styles.bannerWarning}`.trim()}>
          <p className={styles.bannerTitle}>A shared link of yours was reported</p>
          <p className={styles.bannerBody}>
            {moderation.reported_links} of your shared links have been reported. Please review what you shared and revoke any link
            that shouldn&apos;t be active.
          </p>
        </div>
      ) : null}



      <div className={styles.profileHeader}>
        {profile?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatar_url} alt="" className={styles.avatarCircle} />
        ) : (
          <div className={styles.avatarCircle} aria-hidden="true">
            <span className={styles.avatarText}>{avatarText}</span>
          </div>
        )}

        <div className={styles.profileHeaderBody}>
          <p className={styles.profileName}>{displayName || "Your name"}</p>
          <p className={styles.meta}>
            Signed in as <strong>{user.email}</strong>.
          </p>
          <p className={styles.meta}>
            <Link prefetch={false} href={publicUrl}>View public profile</Link>
          </p>
        </div>
      </div>

      <div className={styles.grid}>
        <div className={styles.tile}>
          <h2 className={styles.tileTitle}>Account</h2>
          <p className={styles.meta}>
            <strong>Email:</strong> {user.email}
          </p>
          <p className={styles.meta}>
            <strong>Role:</strong> {user.role}
          </p>
          <p className={styles.meta}>
            <strong>Verification status:</strong> {user.verification_status}
          </p>
        </div>

        <div className={styles.tile}>
          <h2 className={styles.tileTitle}>Onboarding</h2>
          <div className={styles.badges}>
            <span className={styles.badge}>Profile: {user.profile_completed ? "Complete" : "Incomplete"}</span>
            <span className={styles.badge}>Availability: {user.availability_completed ? "Complete" : "Incomplete"}</span>
            <span className={styles.badge}>Onboarding: {user.onboarding_completed ? "Complete" : "Incomplete"}</span>
          </div>

          {!user.onboarding_completed ? (
            <p className={`${styles.meta} mt-3`}>
              <Link prefetch={false} href="/onboarding">Continue onboarding</Link>
            </p>
          ) : null}
        </div>

        <div className={`${styles.tile} col-span-full`}>
          <h2 className={styles.tileTitle}>Edit profile</h2>
          <div className="mb-4"><PhotoUpload name={displayName} src={profile?.avatar_url} back="/volunteer/profile" /></div>
          <p className={styles.meta}>Update your public-safe details. Changes persist on refresh.</p>

          <form action={saveProfile} className={styles.form}>
            <label className={styles.label}>
              Display name (public)
              <input
                name="displayName"
                className={styles.input}
                defaultValue={profile?.display_name || ""}
                placeholder="Sam K."
              />
            </label>

            <div className={styles.twoCol}>
              <label className={styles.label}>
                Public location (optional)
                <input
                  name="publicLocation"
                  className={styles.input}
                  defaultValue={profile?.public_location || profile?.location || ""}
                  placeholder="City / neighborhood (no address)"
                />
              </label>
            </div>

            <label className={styles.label}>
              Nearby radius (miles)
              <input
                name="serviceRadiusMiles"
                type="number"
                min={1}
                max={200}
                className={styles.input}
                defaultValue={(profile?.service_radius_miles ?? 25) as any}
              />
              <p className={styles.meta}>
                Used for distance filtering in Nearby, and as a signal for Recommended when a location is available.
              </p>
            </label>

            <label className={styles.label}>
              Date of birth (private)
              <input name="birthDate" type="date" autoComplete="bday" className={styles.input} defaultValue={profile?.birth_date ?? ""} />
              <p className={styles.meta}>Only used to check age limits. Never shown to anyone.</p>
            </label>

            <div className={styles.label}>
              Background check
              <p className={styles.meta}>
                {({ cleared: "Cleared", pending: "In progress", expired: "Expired — contact support to renew", none: "Not on file" } as Record<string, string>)[
                  String(profile?.background_check_status || "none")
                ]}
                . Some opportunities (for example with children) need a cleared check; our team records it after reviewing your documents.
              </p>
            </div>

            <label className={styles.label}>
              Full name (private — not shown publicly)
              <input
                name="fullName"
                className={styles.input}
                defaultValue={profile?.full_name || ""}
                required
                placeholder="Your legal name"
              />
            </label>

            <label className={styles.label}>
              Phone (private, optional)
              <input
                name="phone"
                className={styles.input}
                defaultValue={profile?.phone || ""}
                placeholder="(555) 555-5555"
              />
            </label>

            <div className={styles.twoCol}>
              <label className={styles.label}>
                Languages (comma-separated)
                <input
                  name="languages"
                  className={styles.input}
                  defaultValue={(profile?.languages || []).join(", ")}
                  placeholder="English, Spanish"
                />
              </label>

              <label className={styles.label}>
                Interaction style tags (comma-separated)
                <input
                  name="interactionStyles"
                  className={styles.input}
                  defaultValue={(profile?.interaction_styles || []).join(", ")}
                  placeholder="Text-first, Calls OK"
                />
              </label>
            </div>

            <label className={styles.label}>
              Bio (public, optional)
              <textarea
                name="bio"
                className={styles.textarea}
                defaultValue={profile?.bio || ""}
                placeholder="A few sentences about your skills and what you like helping with."
              />
            </label>

            <div className={styles.actionsRow}>
              <button className={`${styles.button} ${styles.buttonPrimary}`} type="submit">
                Save profile
              </button>
              <Link prefetch={false} className={styles.button} href={publicUrl}>
                Preview public profile
              </Link>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}



