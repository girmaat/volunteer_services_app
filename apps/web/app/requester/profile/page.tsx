import Link from "next/link";
import { redirect } from "next/navigation";
import { backendFetch, getCurrentUser, getRequesterProfile, getMyShareModerationSummary } from "../../lib/backend";
import styles from "../requester.module.css";

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

function parseCsv(raw: string) {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function formatPercent(v: number | null) {
  if (v === null || !isFinite(v)) return "—";
  return `${Math.round(v * 100)}%`;
}

function formatSeconds(v: number | null) {
  if (v === null || !isFinite(v)) return "—";
  if (v < 60) return `${Math.round(v)}s`;
  const minutes = Math.round(v / 60);
  return `${minutes}m`;
}

type ReputationSummary = {
  received: { average_rating: number; count: number };
  given: { count: number };
};

async function getReputationSummary(): Promise<ReputationSummary | null> {
  const res = await backendFetch("/v1/requester/reputation/summary", { method: "GET" });
  if (!res.ok) return null;
  return (await res.json()) as ReputationSummary;
}

function Stars({ rating }: { rating: number }) {
  const r = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <span aria-label={`Rating: ${r} out of 5`}>
      {"★".repeat(r)}
      {"☆".repeat(5 - r)}
    </span>
  );
}

export default async function Page(
  props: {
    searchParams?: Promise<{ saved?: string; error?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const envelope = await getRequesterProfile();
  const profile = envelope?.profile || null;
  const verification = envelope?.verification;
  const trust = envelope?.trust;
  const rep = await getReputationSummary();
  const moderation = await getMyShareModerationSummary();

  async function saveProfile(formData: FormData) {
    "use server";

    const legalName = String(formData.get("fullName") || "").trim();
    const phoneRaw = String(formData.get("phone") || "").trim();

    const displayNameRaw = String(formData.get("displayName") || "").trim();
    const avatarUrlRaw = String(formData.get("avatarUrl") || "").trim();
    const publicLocationRaw = String(formData.get("publicLocation") || "").trim();

    const bioRaw = String(formData.get("bio") || "").trim();
    const languagesRaw = String(formData.get("languages") || "").trim();
    const interactionTagsRaw = String(formData.get("interactionStyles") || "").trim();

    const needCategoriesRaw = String(formData.get("needCategories") || "").trim();
    const needHelpPromptRaw = String(formData.get("needHelpPrompt") || "").trim();

    const availabilityWindows: string[] = [];
    if (formData.get("avail_weekdays")) availabilityWindows.push("weekdays");
    if (formData.get("avail_evenings")) availabilityWindows.push("evenings");
    if (formData.get("avail_weekends")) availabilityWindows.push("weekends");

    if (!legalName) {
      redirect("/requester/profile?error=" + encodeURIComponent("Full name is required."));
    }

    const payload: any = {};


    // Private (allow clearing by sending null)
    payload.fullName = legalName;
    payload.phone = phoneRaw ? phoneRaw : null;

    // Public (allow clearing by sending null)
    payload.displayName = displayNameRaw ? displayNameRaw : null;
    payload.avatarUrl = avatarUrlRaw ? avatarUrlRaw : null;
    payload.publicLocation = publicLocationRaw ? publicLocationRaw : null;
    payload.bio = bioRaw ? bioRaw : null;

    payload.languages = languagesRaw ? parseCsv(languagesRaw) : [];
    payload.interactionStyles = interactionTagsRaw ? parseCsv(interactionTagsRaw) : [];
    payload.availabilityWindows = availabilityWindows;

    // Requester-specific
    payload.needCategories = needCategoriesRaw ? parseCsv(needCategoriesRaw) : [];
    payload.needHelpPrompt = needHelpPromptRaw ? needHelpPromptRaw : null;

    payload.parkingAvailable = !!formData.get("parking_available");
    payload.elevatorAvailable = !!formData.get("elevator_available");
    payload.stairsPresent = !!formData.get("stairs_present");

    const pickupVsDropoff = String(formData.get("pickup_vs_dropoff") || "").trim();
    payload.pickupVsDropoff = pickupVsDropoff ? pickupVsDropoff : null;

    const timeFlexibility = String(formData.get("time_flexibility") || "").trim();
    payload.timeFlexibility = timeFlexibility ? timeFlexibility : null;

    payload.petsAtHome = !!formData.get("pets_at_home");
    payload.smokeFree = !!formData.get("smoke_free");

    const accessibilityNeeds = String(formData.get("accessibility_needs") || "").trim();
    payload.accessibilityNeeds = accessibilityNeeds ? accessibilityNeeds : null;

    payload.meetInPublicFirst = !!formData.get("meet_in_public_first");
    payload.someoneElsePresent = !!formData.get("someone_else_present");
    payload.maskPreferred = !!formData.get("mask_preferred");

    const res = await backendFetch("/v1/requester/profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as any;
      const msg = data?.message || "Failed to save profile.";
      redirect("/requester/profile?error=" + encodeURIComponent(msg));
    }

    redirect("/requester/profile?saved=1");
  }

  const displayName = (profile?.display_name || profile?.full_name || user.email || "").trim();
  const avatarText = initialsFrom(displayName);
  const publicUrl = `/requesters/${user.id}`;

  const avail = new Set((profile?.availability_windows || []) as string[]);
  const isWeekdays = avail.has("weekdays");
  const isEvenings = avail.has("evenings");
  const isWeekends = avail.has("weekends");

  return (
    <>
      <h1 className={styles.sectionTitle}>Profile</h1>

      {searchParams?.saved ? (
        <div className={`${styles.banner} ${styles.bannerSuccess}`.trim()}>
          <p className={styles.bannerTitle}>Saved</p>
          <p className={styles.bannerBody}>Your profile changes were saved.</p>
        </div>
      ) : null}

      {searchParams?.error ? (
        <div className={`${styles.banner} ${styles.bannerError}`.trim()}>
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
        <div className={styles.avatarCircle} aria-hidden="true">
          <span className={styles.avatarText}>{avatarText}</span>
        </div>

        <div className={styles.profileHeaderBody}>
          <p className={styles.profileName}>{displayName || "Your name"}</p>
          <p className={styles.meta}>
            Signed in as <strong>{user.email}</strong>.
          </p>
          <p className={styles.meta}>
            <Link href={publicUrl}>View public profile</Link>
          </p>

          {verification ? (
            <div className={styles.badges} aria-label="Verification badges">
              <span className={styles.badge}>Email: {verification.email_verified ? "Verified" : "Unverified"}</span>
              <span className={styles.badge}>Phone: {verification.phone_verified ? "Verified" : "Unverified"}</span>
              <span className={styles.badge}>ID: {verification.id_verification_status || "not_required"}</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className={styles.grid}>
        <div className={styles.tile}>
          <h2 className={styles.tileTitle}>Trust signals</h2>
          <p className={styles.tileBody}>
            Completed commitments: <strong>{trust?.completed_commitments_count ?? 0}</strong>
            <br />
            Cancellation rate: <strong>{formatPercent(trust?.cancellation_rate ?? null)}</strong>
            <br />
            Typical response time: <strong>{formatSeconds(trust?.typical_response_time_seconds ?? null)}</strong>
            <br />
            Thank-you notes: <strong>{trust?.thank_you_notes_count ?? 0}</strong>
          </p>
        </div>

        <Link className={styles.tileLink} href="/requester/reputation">
          <div className={styles.tile}>
            <h2 className={styles.tileTitle}>Reputation</h2>
            <p className={styles.tileBody}>
              {rep ? (
                <>
                  <Stars rating={rep.received.average_rating} /> {rep.received.average_rating.toFixed(1)}
                </>
              ) : (
                "—"
              )}
            </p>
            <p className={styles.meta} style={{ margin: 0 } as any}>
              {rep ? `${rep.received.count} reviews received · ${rep.given.count} given` : "Unable to load reputation"}
            </p>
          </div>
        </Link>

        <div className={styles.tile}>
          <h2 className={styles.tileTitle}>Account</h2>
          <p className={styles.tileBody}>
            Email: <strong>{user.email}</strong>
            <br />
            Role: <strong>{user.role}</strong>
          </p>
        </div>

        <div className={styles.tile} style={{ gridColumn: "1 / -1" } as any}>
          <h2 className={styles.tileTitle}>Edit profile</h2>
          <p className={styles.meta}>
            Public profile details are shown to volunteers before you chat. Keep it coarse (city/neighborhood only).
          </p>

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

            <div className={styles.row}>
              <label className={styles.label} style={{ flex: 1 } as any}>
                Public location (optional)
                <input
                  name="publicLocation"
                  className={styles.input}
                  defaultValue={profile?.public_location || profile?.location || ""}
                  placeholder="City / neighborhood (no address)"
                />
              </label>

              <label className={styles.label} style={{ flex: 1 } as any}>
                Avatar URL (optional)
                <input
                  name="avatarUrl"
                  className={styles.input}
                  defaultValue={profile?.avatar_url || ""}
                  placeholder="https://..."
                />
              </label>
            </div>

            <label className={styles.label}>
              Legal name (private — not shown publicly)
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

            <div className={styles.row}>
              <label className={styles.label} style={{ flex: 1 } as any}>
                Languages (comma-separated)
                <input
                  name="languages"
                  className={styles.input}
                  defaultValue={(profile?.languages || []).join(", ")}
                  placeholder="English, Spanish"
                />
              </label>

              <label className={styles.label} style={{ flex: 1 } as any}>
                Interaction tags (comma-separated)
                <input
                  name="interactionStyles"
                  className={styles.input}
                  defaultValue={(profile?.interaction_styles || []).join(", ")}
                  placeholder="Text-first, Calls OK"
                />
              </label>
            </div>

            <div className={styles.card}>
              <p className={styles.sectionTitle}>Availability windows (broad)</p>
              <div className={styles.form}>
                <label className={styles.checkboxRow}>
                  <input type="checkbox" name="avail_weekdays" defaultChecked={isWeekdays} /> Weekdays
                </label>
                <label className={styles.checkboxRow}>
                  <input type="checkbox" name="avail_evenings" defaultChecked={isEvenings} /> Evenings
                </label>
                <label className={styles.checkboxRow}>
                  <input type="checkbox" name="avail_weekends" defaultChecked={isWeekends} /> Weekends
                </label>
              </div>
            </div>

            <label className={styles.label}>
              Bio (public, optional)
              <textarea
                name="bio"
                className={styles.textarea}
                defaultValue={profile?.bio || ""}
                placeholder="A short intro to help volunteers understand you."
              />
            </label>

            <div className={styles.card}>
              <p className={styles.sectionTitle}>What I usually need help with</p>

              <label className={styles.label}>
                Need categories (comma-separated)
                <input
                  name="needCategories"
                  className={styles.input}
                  defaultValue={(profile?.need_categories || []).join(", ")}
                  placeholder="Groceries, Rides, Errands"
                />
              </label>

              <label className={styles.label}>
                Short prompt (optional)
                <textarea
                  name="needHelpPrompt"
                  className={styles.textarea}
                  defaultValue={profile?.need_help_prompt || ""}
                  placeholder="Example: I usually need help with grocery runs and occasional lifting."
                />
              </label>
            </div>

            <div className={styles.card}>
              <p className={styles.sectionTitle}>Logistics</p>

              <label className={styles.checkboxRow}>
                <input type="checkbox" name="parking_available" defaultChecked={!!profile?.parking_available} /> Parking available
              </label>
              <label className={styles.checkboxRow}>
                <input type="checkbox" name="elevator_available" defaultChecked={!!profile?.elevator_available} /> Elevator available
              </label>
              <label className={styles.checkboxRow}>
                <input type="checkbox" name="stairs_present" defaultChecked={!!profile?.stairs_present} /> Stairs present
              </label>

              <div className={styles.row}>
                <label className={styles.label} style={{ flex: 1 } as any}>
                  Pickup vs dropoff (optional)
                  <select
                    name="pickup_vs_dropoff"
                    className={styles.select}
                    defaultValue={profile?.pickup_vs_dropoff || ""}
                  >
                    <option value="">—</option>
                    <option value="pickup">Pickup</option>
                    <option value="dropoff">Dropoff</option>
                    <option value="either">Either</option>
                  </select>
                </label>

                <label className={styles.label} style={{ flex: 1 } as any}>
                  Time flexibility (optional)
                  <select
                    name="time_flexibility"
                    className={styles.select}
                    defaultValue={profile?.time_flexibility || ""}
                  >
                    <option value="">—</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </label>
              </div>
            </div>

            <div className={styles.card}>
              <p className={styles.sectionTitle}>Household context (optional)</p>

              <label className={styles.checkboxRow}>
                <input type="checkbox" name="pets_at_home" defaultChecked={!!profile?.pets_at_home} /> Pets at home
              </label>
              <label className={styles.checkboxRow}>
                <input type="checkbox" name="smoke_free" defaultChecked={!!profile?.smoke_free} /> Smoke-free
              </label>

              <label className={styles.label}>
                Accessibility needs (optional)
                <textarea
                  name="accessibility_needs"
                  className={styles.textarea}
                  defaultValue={profile?.accessibility_needs || ""}
                  placeholder="Example: limited stairs, hearing accessibility, etc."
                />
              </label>
            </div>

            <div className={styles.card}>
              <p className={styles.sectionTitle}>Safety preferences</p>

              <label className={styles.checkboxRow}>
                <input type="checkbox" name="meet_in_public_first" defaultChecked={!!profile?.meet_in_public_first} /> Meet in public first
              </label>
              <label className={styles.checkboxRow}>
                <input type="checkbox" name="someone_else_present" defaultChecked={!!profile?.someone_else_present} /> Someone else present
              </label>
              <label className={styles.checkboxRow}>
                <input type="checkbox" name="mask_preferred" defaultChecked={!!profile?.mask_preferred} /> Mask preferred
              </label>
            </div>

            <div className={styles.row}>
              <button className={styles.button} type="submit">
                Save profile
              </button>
              <Link className={styles.button} href={publicUrl}>
                Preview public profile
              </Link>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}




