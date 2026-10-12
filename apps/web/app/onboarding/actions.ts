"use server";

import { redirect } from "next/navigation";
import { backendFetch } from "../lib/backend";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const list = (fd: FormData, k: string) => fd.getAll(k).map((v) => String(v).trim()).filter(Boolean);
const csv = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 20);

async function post(path: string, body: unknown, back: string) {
  const r = await backendFetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) {
    const j = (await r.json().catch(() => null)) as { message?: string } | null;
    redirect(`${back}${back.includes("?") ? "&" : "?"}error=${encodeURIComponent(j?.message || "That didn't save. Try again.")}`);
  }
}

/** Step 1: how you'll use ThankYou. Organizations continue in the organization flow. */
export async function chooseRole(fd: FormData) {
  const choice = str(fd, "role");
  if (choice === "organization") redirect("/org/signup");
  if (choice !== "volunteer" && choice !== "requester") redirect("/onboarding?error=" + encodeURIComponent("Pick one to continue."));
  await post("/v1/onboarding/role", { role: choice }, "/onboarding");
  if (choice === "requester") await post("/v1/onboarding/requester-mode", { mode: "individual" }, "/onboarding");
  redirect("/onboarding?step=about");
}

/** Step 2: name and neighborhood (the neighborhood powers "near you"; it's never shown exactly). */
export async function saveAbout(fd: FormData) {
  const fullName = str(fd, "fullName");
  if (!fullName) redirect("/onboarding?step=about&error=" + encodeURIComponent("Add your name so people know who they're talking to."));
  const area = str(fd, "publicLocation");
  await post(
    "/v1/onboarding/profile",
    {
      fullName,
      displayName: str(fd, "displayName") || fullName.split(/\s+/)[0],
      ...(area ? { publicLocation: area } : {}),
      ...(str(fd, "phone") ? { phone: str(fd, "phone") } : {}),
      ...(str(fd, "birthDate") ? { birthDate: str(fd, "birthDate") } : {})
    },
    "/onboarding?step=about"
  );
  redirect(str(fd, "role") === "requester" ? "/onboarding?step=needs" : "/onboarding?step=interests");
}

/** Volunteer step 3: what you'd like to help with. Everything here is optional. */
export async function saveInterests(fd: FormData) {
  if (str(fd, "intent") === "skip") redirect("/onboarding?step=schedule");
  const radius = Number(str(fd, "radius")) || 10;
  await post(
    "/v1/onboarding/profile",
    {
      helpCategories: Array.from(new Set([...list(fd, "categories"), ...list(fd, "skills"), ...csv(str(fd, "otherSkills"))])),
      experienceTags: list(fd, "causes"),
      serviceRadiusMiles: Math.min(Math.max(Math.round(radius), 1), 100),
      hasCar: fd.get("hasCar") === "on"
    },
    "/onboarding?step=interests"
  );
  redirect("/onboarding?step=schedule");
}

/** Volunteer step 4: when and how. Finishing this completes onboarding. */
export async function saveSchedule(fd: FormData) {
  const days = list(fd, "days");
  const remoteOk = fd.get("remoteOk") === "on";
  const inPersonOk = fd.get("inPersonOk") === "on";
  if (!days.length) redirect("/onboarding?step=schedule&error=" + encodeURIComponent("Pick at least one day (you can change it any time)."));
  if (!remoteOk && !inPersonOk) redirect("/onboarding?step=schedule&error=" + encodeURIComponent("Choose in person, remote, or both."));
  await post(
    "/v1/onboarding/availability",
    { timezone: str(fd, "timezone") || "America/New_York", days, hoursPerWeek: Number(str(fd, "hours")) || 2, remoteOk, inPersonOk },
    "/onboarding?step=schedule"
  );
  redirect("/onboarding/welcome");
}

/** Requester step 3: what you usually need. Finishing this completes onboarding. */
export async function saveNeeds(fd: FormData) {
  if (str(fd, "intent") !== "skip") {
    await post(
      "/v1/onboarding/profile",
      {
        needCategories: list(fd, "needs"),
        ...(str(fd, "needHelpPrompt") ? { needHelpPrompt: str(fd, "needHelpPrompt") } : {}),
        meetInPublicFirst: fd.get("meetInPublicFirst") === "on",
        someoneElsePresent: fd.get("someoneElsePresent") === "on"
      },
      "/onboarding?step=needs"
    );
  }
  // Requesters don't need a weekly schedule; this marks that step done.
  await post("/v1/onboarding/availability/skip", {}, "/onboarding?step=needs");
  redirect("/onboarding/welcome");
}
