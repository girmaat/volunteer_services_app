import styles from "../(auth)/auth.module.css";
import { backendFetch, getCurrentUser, getOnboardingProfile } from "../lib/backend";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const ENABLE_DOCUMENT_VERIFICATION_ONBOARDING = process.env.NEXT_PUBLIC_ENABLE_DOCUMENT_VERIFICATION_ONBOARDING === "true";

const days = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

function parseCsv(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function nextStep(u: any) {
  const role = String(u.role || "");
  const requesterMode =
    String(u.requester_mode || "") ||
    (u.account_type === "org_requester" ? "organization" : u.account_type === "individual_requester" ? "individual" : "");

  const isRequester = role === "requester";
  const isOrgRequester = isRequester && requesterMode === "organization";
  const isIndividualRequester = isRequester && requesterMode === "individual";

  // New flow: user explicitly chooses one of:
  // - volunteer
  // - requester (individual)
  // - requester (organization)
  if (!role) return "role";
  if (isRequester && !requesterMode) return "role";

  if (!u.profile_completed) return "profile";

  // Availability is required for volunteers and shown (skippable) for individual requesters.
  if ((role === "volunteer" || isIndividualRequester) && !u.availability_completed) return "availability";

  if (ENABLE_DOCUMENT_VERIFICATION_ONBOARDING && u.verification_required && u.verification_status === "required") {
    return "verification";
  }

  return "done";
}

async function setRoleAction(formData: FormData) {
  "use server";

  const choice = String(formData.get("role") || "");

  // Map the single UI choice into the persisted backend role + requester subtype.
  let role: "volunteer" | "requester";
  let requesterMode: "individual" | "organization" | null = null;

  if (choice === "volunteer") {
    role = "volunteer";
  } else if (choice === "requester_individual") {
    role = "requester";
    requesterMode = "individual";
  } else if (choice === "requester_organization") {
    role = "requester";
    requesterMode = "organization";
  } else {
    throw new Error("Invalid role selection");
  }

  const roleRes = await backendFetch("/v1/onboarding/role", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ role })
  });

  if (!roleRes.ok) {
    const err = await roleRes.json().catch(() => ({}));
    throw new Error(err?.message || "Failed to save role");
  }

  if (requesterMode) {
    const modeRes = await backendFetch("/v1/onboarding/requester-mode", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: requesterMode })
    });

    if (!modeRes.ok) {
      const err = await modeRes.json().catch(() => ({}));
      throw new Error(err?.message || "Failed to save requester setup");
    }
  }

  // Organization requester proceeds to the organization onboarding flow.
  // Individual requester + volunteers continue the standard onboarding flow.
  redirect("/onboarding");
}



async function setProfileAction(formData: FormData) {
  "use server";
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const role = String((user as any).role || "");
  const requesterMode =
    String((user as any).requester_mode || "") ||
    ((user as any).account_type === "org_requester"
      ? "organization"
      : (user as any).account_type === "individual_requester"
        ? "individual"
        : "");

  const isVolunteer = role === "volunteer";
  const isRequester = role === "requester";
  const isIndividualRequester = isRequester && requesterMode === "individual";

  const payload: any = {
    fullName: String(formData.get("fullName") || "").trim(),
    displayName: String(formData.get("displayName") || "").trim() || undefined,
    avatarUrl: String(formData.get("avatarUrl") || "").trim() || undefined,
    phone: String(formData.get("phone") || "").trim() || undefined,
    publicLocation: String(formData.get("publicLocation") || "").trim() || undefined,
    bio: String(formData.get("bio") || "").trim() || undefined,
    languages: parseCsv(String(formData.get("languages") || "")),
    interactionStyles: parseCsv(String(formData.get("interactionStyles") || ""))
  };

  if (isVolunteer) {
    payload.helpCategories = parseCsv(String(formData.get("helpCategories") || ""));
    payload.experienceTags = parseCsv(String(formData.get("experienceTags") || ""));
    payload.experience = String(formData.get("experience") || "").trim() || undefined;

    const radiusRaw = String(formData.get("serviceRadiusMiles") || "").trim();
    payload.serviceRadiusMiles = radiusRaw ? Number(radiusRaw) : undefined;

    payload.hasCar = formData.get("hasCar") === "on";
    payload.canLiftHeavy = formData.get("canLiftHeavy") === "on";
    payload.stairsOk = formData.get("stairsOk") === "on";
    payload.petFriendly = formData.get("petFriendly") === "on";
  }

  if (isIndividualRequester) {
    payload.needCategories = parseCsv(String(formData.get("needCategories") || ""));
    payload.needHelpPrompt = String(formData.get("needHelpPrompt") || "").trim() || undefined;

    const pickup = String(formData.get("pickupVsDropoff") || "").trim();
    payload.pickupVsDropoff = pickup || undefined;

    const flex = String(formData.get("timeFlexibility") || "").trim();
    payload.timeFlexibility = flex || undefined;

    payload.parkingAvailable = formData.get("parkingAvailable") === "on";
    payload.elevatorAvailable = formData.get("elevatorAvailable") === "on";
    payload.stairsPresent = formData.get("stairsPresent") === "on";
    payload.petsAtHome = formData.get("petsAtHome") === "on";
    payload.smokeFree = formData.get("smokeFree") === "on";

    payload.accessibilityNeeds = String(formData.get("accessibilityNeeds") || "").trim() || undefined;
    payload.meetInPublicFirst = formData.get("meetInPublicFirst") === "on";
    payload.someoneElsePresent = formData.get("someoneElsePresent") === "on";
    payload.maskPreferred = formData.get("maskPreferred") === "on";
  }

  const res = await backendFetch("/v1/onboarding/profile", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message || "Failed to save profile");
  }
  redirect("/onboarding");
}

async function setAvailabilityAction(formData: FormData) {
  "use server";
  const selectedDays = days.filter((d) => formData.get(`day_${d}`) === "on");
  const payload = {
    timezone: String(formData.get("timezone") || ""),
    days: selectedDays,
    hoursPerWeek: Number(formData.get("hoursPerWeek") || 0),
    remoteOk: formData.get("remoteOk") === "on",
    inPersonOk: formData.get("inPersonOk") === "on"
  };

  const res = await backendFetch("/v1/onboarding/availability", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message || "Failed to save availability");
  }
  redirect("/onboarding");
}

async function skipAvailabilityAction() {
  "use server";
  const res = await backendFetch("/v1/onboarding/availability/skip", { method: "POST" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message || "Failed to skip availability");
  }
  redirect("/onboarding");
}

async function verificationAction(formData: FormData) {
  "use server";

  const res = await backendFetch("/v1/onboarding/verification", {
    method: "POST",
    body: formData
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message || "Verification upload failed");
  }

  redirect("/onboarding");
}

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const role = String(user.role || "");
  const requesterMode =
    String((user as any).requester_mode || "") ||
    ((user as any).account_type === "org_requester"
      ? "organization"
      : (user as any).account_type === "individual_requester"
        ? "individual"
        : "");
  const isOrgRequester = role === "requester" && requesterMode === "organization";
  const isIndividualRequester = role === "requester" && requesterMode === "individual";

  if (user.onboarding_completed) {
    redirect(isOrgRequester ? "/org/signup" : "/dashboard");
  }

  // Org requesters complete a minimal personal profile here, then continue in the org flow.
  if (isOrgRequester && user.profile_completed) {
    redirect("/org/signup");
  }

  const profile = await getOnboardingProfile();

  const step = nextStep(user);

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>First-time onboarding</h1>
        <p className={styles.subtitle}>A few quick steps to personalize your experience.</p>
      </header>

      <div className={styles.card}>
        <div className={styles.progress}>
          <span className={`${styles.step} ${step === "role" ? styles.stepActive : ""}`}>Role</span>
          <span className={`${styles.step} ${step === "profile" ? styles.stepActive : ""}`}>Profile</span>

          {isOrgRequester ? (
            <span className={`${styles.step} ${step === "done" ? styles.stepActive : ""}`}>Organization</span>
          ) : (
            <span className={`${styles.step} ${step === "availability" ? styles.stepActive : ""}`}>Availability</span>
          )}

          {ENABLE_DOCUMENT_VERIFICATION_ONBOARDING && user.verification_required ? (
            <span className={`${styles.step} ${step === "verification" ? styles.stepActive : ""}`}>Verification</span>
          ) : null}

          <span className={`${styles.step} ${step === "done" ? styles.stepActive : ""}`}>Done</span>
        </div>

        {profile ? (
          <div style={{ margin: "0.75rem 0 1rem" } as any}>
            <div className={styles.meta}><strong>Profile snapshot</strong></div>
            <div className={styles.meta}>
              {profile.display_name ? <span><strong>Public name:</strong> {profile.display_name}</span> : null}
              {profile.public_location ? <span style={{ marginLeft: "0.75rem" } as any}><strong>Location:</strong> {profile.public_location}</span> : null}
            </div>
            {profile.languages?.length ? (
              <div className={styles.meta}><strong>Languages:</strong> {profile.languages.join(", ")}</div>
            ) : null}
            {profile.interaction_styles?.length ? (
              <div className={styles.meta}><strong>Interaction styles:</strong> {profile.interaction_styles.join(", ")}</div>
            ) : null}
          </div>
        ) : null}

        {step === "role" ? (
          <form className={styles.form} action={setRoleAction}>
            <div className={styles.meta}>Choose how you’ll use ThankYou</div>

            <div className={styles.grid3}>
              <label className={styles.roleCard}>
                <input type="radio" name="role" value="volunteer" required />{" "}
                <p className={styles.roleTitle}>Volunteer</p>
                <p className={styles.roleBody}>Find opportunities and offer time/skills.</p>
              </label>

              <label className={styles.roleCard}>
                <input type="radio" name="role" value="requester_individual" required />{" "}
                <p className={styles.roleTitle}>Individual requester</p>
                <p className={styles.roleBody}>Request help as yourself (no organization profile).</p>
              </label>

              <label className={styles.roleCard}>
                <input type="radio" name="role" value="requester_organization" required />{" "}
                <p className={styles.roleTitle}>Organization requester</p>
                <p className={styles.roleBody}>Request on behalf of an organization.</p>
              </label>
            </div>

            <div className={styles.buttonRow}>
              <button className={styles.button} type="submit">Continue</button>
            </div>
          </form>
        ) : null}

{step === "profile" ? (
          <form className={styles.form} action={setProfileAction}>
            <div className={styles.meta}>Basic profile setup</div>

            <label>
              <div className={styles.meta}>Full name</div>
              <input className={styles.input} name="fullName" defaultValue={profile?.full_name || ""} required />
            </label>

            <label>
              <div className={styles.meta}>Display name (public, optional)</div>
              <input className={styles.input} name="displayName" defaultValue={profile?.display_name || ""} placeholder="Sam K." />
            </label>

            <label>
              <div className={styles.meta}>Avatar URL (public, optional)</div>
              <input className={styles.input} name="avatarUrl" defaultValue={profile?.avatar_url || ""} placeholder="https://..." />
            </label>

            <label>
              <div className={styles.meta}>Phone (optional)</div>
              <input className={styles.input} name="phone" defaultValue={profile?.phone || ""} />
            </label>

            <label>
              <div className={styles.meta}>Public location (optional)</div>
              <input className={styles.input} name="publicLocation" defaultValue={profile?.public_location || profile?.location || ""} placeholder="City / neighborhood (no address)" />
            </label>

            <label>
              <div className={styles.meta}>Languages (comma-separated)</div>
              <input className={styles.input} name="languages" defaultValue={(profile?.languages || []).join(", ")} placeholder="English, Spanish" />
            </label>

            <label>
              <div className={styles.meta}>Preferred interaction styles (comma-separated)</div>
              <input className={styles.input} name="interactionStyles" defaultValue={(profile?.interaction_styles || []).join(", ")} placeholder="Text-first, Calls OK" />
            </label>

            <label>
              <div className={styles.meta}>Short bio (optional)</div>
              <textarea className={styles.textarea} name="bio" defaultValue={profile?.bio || ""} />
            </label>

            {role === "volunteer" ? (
              <>
                <div className={styles.meta} style={{ marginTop: "0.5rem" } as any}>
                  Volunteer details
                </div>

                <label>
                  <div className={styles.meta}>Skills / help categories (comma-separated)</div>
                  <input
                    className={styles.input}
                    name="helpCategories"
                    required
                    defaultValue={(profile?.help_categories || []).join(", ")}
                    placeholder="Groceries, Companionship, Tech help"
                  />
                </label>

                <div>
                  <div className={styles.meta}>Causes / interests</div>
                  <div className={styles.meta}>
                    Tip: include cause words like “seniors”, “families”, “disability access” in your categories/tags.
                  </div>
                </div>

                <label>
                  <div className={styles.meta}>Experience / background (optional)</div>
                  <textarea className={styles.textarea} name="experience" defaultValue={profile?.experience || ""} />
                </label>

                <label>
                  <div className={styles.meta}>Experience tags (comma-separated, optional)</div>
                  <input
                    className={styles.input}
                    name="experienceTags"
                    defaultValue={(profile?.experience_tags || []).join(", ")}
                    placeholder="CPR, Spanish, Cooking"
                  />
                </label>

                <label>
                  <div className={styles.meta}>Service radius (miles, optional)</div>
                  <input
                    className={styles.input}
                    name="serviceRadiusMiles"
                    type="number"
                    min={1}
                    max={250}
                    defaultValue={profile?.service_radius_miles ?? ""}
                  />
                </label>

                <div>
                  <div className={styles.meta}>Logistics (optional)</div>
                  <div className={styles.buttonRow}>
                    <label className={styles.meta}>
                      <input type="checkbox" name="hasCar" defaultChecked={!!profile?.has_car} /> Has a car
                    </label>
                    <label className={styles.meta}>
                      <input type="checkbox" name="canLiftHeavy" defaultChecked={!!profile?.can_lift_heavy} /> Can lift heavy
                    </label>
                    <label className={styles.meta}>
                      <input type="checkbox" name="stairsOk" defaultChecked={!!profile?.stairs_ok} /> OK with stairs
                    </label>
                    <label className={styles.meta}>
                      <input type="checkbox" name="petFriendly" defaultChecked={!!profile?.pet_friendly} /> Pet friendly
                    </label>
                  </div>
                </div>
              </>
            ) : null}

            {isIndividualRequester ? (
              <>
                <div className={styles.meta} style={{ marginTop: "0.5rem" } as any}>
                  Requester details
                </div>

                <label>
                  <div className={styles.meta}>Help type / categories (comma-separated)</div>
                  <input
                    className={styles.input}
                    name="needCategories"
                    required
                    defaultValue={(profile?.need_categories || []).join(", ")}
                    placeholder="Errands, Rides, Home tasks"
                  />
                </label>

                <label>
                  <div className={styles.meta}>What help do you usually request?</div>
                  <textarea
                    className={styles.textarea}
                    name="needHelpPrompt"
                    required
                    defaultValue={profile?.need_help_prompt || ""}
                    placeholder="A sentence or two helps volunteers understand typical needs."
                  />
                </label>

                <div>
                  <div className={styles.meta}>Logistics (optional)</div>
                  <div className={styles.buttonRow}>
                    <label className={styles.meta}>
                      <input type="checkbox" name="parkingAvailable" defaultChecked={!!profile?.parking_available} /> Parking available
                    </label>
                    <label className={styles.meta}>
                      <input type="checkbox" name="elevatorAvailable" defaultChecked={!!profile?.elevator_available} /> Elevator available
                    </label>
                    <label className={styles.meta}>
                      <input type="checkbox" name="stairsPresent" defaultChecked={!!profile?.stairs_present} /> Stairs present
                    </label>
                    <label className={styles.meta}>
                      <input type="checkbox" name="petsAtHome" defaultChecked={!!profile?.pets_at_home} /> Pets at home
                    </label>
                    <label className={styles.meta}>
                      <input type="checkbox" name="smokeFree" defaultChecked={!!profile?.smoke_free} /> Smoke-free home
                    </label>
                  </div>
                </div>

                <label>
                  <div className={styles.meta}>Pickup vs dropoff preference (optional)</div>
                  <select className={styles.input} name="pickupVsDropoff" defaultValue={profile?.pickup_vs_dropoff || ""}>
                    <option value="">No preference</option>
                    <option value="pickup">Volunteer picks up</option>
                    <option value="dropoff">Volunteer drops off</option>
                    <option value="either">Either</option>
                  </select>
                </label>

                <label>
                  <div className={styles.meta}>Time flexibility (optional)</div>
                  <select className={styles.input} name="timeFlexibility" defaultValue={profile?.time_flexibility || ""}>
                    <option value="">Not sure</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </label>

                <label>
                  <div className={styles.meta}>Accessibility notes (optional)</div>
                  <textarea className={styles.textarea} name="accessibilityNeeds" defaultValue={profile?.accessibility_needs || ""} />
                </label>

                <div>
                  <div className={styles.meta}>Communication & safety preferences (optional)</div>
                  <div className={styles.buttonRow}>
                    <label className={styles.meta}>
                      <input type="checkbox" name="meetInPublicFirst" defaultChecked={!!profile?.meet_in_public_first} /> Meet in public first
                    </label>
                    <label className={styles.meta}>
                      <input type="checkbox" name="someoneElsePresent" defaultChecked={!!profile?.someone_else_present} /> Someone else present
                    </label>
                    <label className={styles.meta}>
                      <input type="checkbox" name="maskPreferred" defaultChecked={!!profile?.mask_preferred} /> Mask preferred
                    </label>
                  </div>
                </div>
              </>
            ) : null}

            <div className={styles.buttonRow}>
              <button className={styles.button} type="submit">Save profile</button>
            </div>
          </form>
        ) : null}

        {step === "availability" ? (
          <form className={styles.form} action={setAvailabilityAction}>
            <div className={styles.meta}>Availability & preferences{isIndividualRequester ? " (optional)" : ""}</div>

            <label>
              <div className={styles.meta}>Timezone</div>
              <input className={styles.input} name="timezone" defaultValue="America/New_York" required />
            </label>

            <div>
              <div className={styles.meta}>Days available</div>
              <div className={styles.buttonRow}>
                {days.map((d) => (
                  <label key={d} className={styles.meta}>
                    <input type="checkbox" name={`day_${d}`} /> {d}
                  </label>
                ))}
              </div>
            </div>

            <label>
              <div className={styles.meta}>Hours per week</div>
              <input className={styles.input} name="hoursPerWeek" type="number" min={1} max={80} defaultValue={2} required />
            </label>

            <div className={styles.buttonRow}>
              <label className={styles.meta}>
                <input type="checkbox" name="remoteOk" defaultChecked /> Remote OK
              </label>
              <label className={styles.meta}>
                <input type="checkbox" name="inPersonOk" /> In-person OK
              </label>
            </div>

            <div className={styles.buttonRow}>
              <button className={styles.button} type="submit">Save availability</button>
              {isIndividualRequester ? (
                <button className={styles.meta} type="submit" formAction={skipAvailabilityAction} formNoValidate>
                  Skip availability
                </button>
              ) : null}
            </div>
          </form>
        ) : null}

        {ENABLE_DOCUMENT_VERIFICATION_ONBOARDING && step === "verification" ? (
          <form className={styles.form} action={verificationAction} encType="multipart/form-data">
            <div className={styles.meta}>Verification prompt</div>
            <div className={styles.meta}>
              This role requires verification. Upload a PDF/JPG/PNG.
            </div>

            <label>
              <div className={styles.meta}>Document</div>
              <input className={styles.input} name="document" type="file" accept=".pdf,image/jpeg,image/png" required />
            </label>

            <div className={styles.buttonRow}>
              <button className={styles.button} type="submit">Submit verification</button>
            </div>
          </form>
        ) : null}

        {step === "done" ? (
          <div className={styles.success}>
            Onboarding complete.
            <div className={styles.buttonRow} style={{ marginTop: "0.8rem" } as any}>
              <a className={styles.button} href="/dashboard">Go to dashboard</a>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}