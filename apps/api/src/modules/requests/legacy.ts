/**
 * Adapters for the original create/update endpoints (/v1/requester/requests, /v1/org/requests),
 * kept for older screens and API clients. Everything still goes through the lifecycle.
 */
import { pool } from "../../lib/db";
import { saveFields } from "./routes";
import { transitionRequest, TransitionError, type RequestEvent } from "./lifecycle";

const TAG_CATEGORY: [string[], string][] = [
  [["food"], "food"],
  [["education", "tutoring", "reading", "math", "careers", "writing"], "tutoring"],
  [["translation", "spanish"], "translation"],
  [["transport", "driving"], "transport"],
  [["tech", "web design", "data", "forms"], "tech"],
  [["companionship"], "companionship"],
  [["community", "event setup", "organizing", "outdoors"], "events"],
  [["lifting", "errands"], "errands"]
];

export function categoryFromTags(tags: string[]): string {
  for (const [keys, cat] of TAG_CATEGORY) if (tags.some((t) => keys.includes(t))) return cat;
  return "other";
}

export async function createAndPublishLegacy(input: {
  userId: string;
  orgSlug: string | null;
  title: string;
  description: string;
  mode: "in-person" | "remote" | "hybrid";
  area: string;
  neededBy: string | null;
  tags: string[];
  status: string;
}): Promise<string> {
  const ins = await pool.query(
    `INSERT INTO service_requests (requester_user_id, requester_org_slug, status, title, description, mode, timezone, location_text)
     VALUES ($1, $2, 'draft', '', '', 'remote', 'America/New_York', '') RETURNING id`,
    [input.userId, input.orgSlug]
  );
  const id = String(ins.rows[0].id);
  await pool.query(
    "INSERT INTO request_status_events (request_id, event, from_status, to_status, actor_user_id, actor_kind) VALUES ($1, 'create', NULL, 'draft', $2, 'user')",
    [id, input.userId]
  );
  await saveFields(id, {
    title: input.title,
    description: input.description,
    mode: input.mode,
    publicArea: input.area || null,
    startsAt: input.neededBy,
    scheduleType: input.neededBy ? "one_time" : "flexible_window",
    requiredSkills: input.tags,
    category: categoryFromTags(input.tags)
  });
  if (input.status !== "draft") {
    try {
      await transitionRequest(id, "publish", { userId: input.userId, kind: "user" });
      if (input.status === "paused") await transitionRequest(id, "pause", { userId: input.userId, kind: "user" });
      if (input.status === "closed") await transitionRequest(id, "cancel", { userId: input.userId, kind: "user" }, { reason: "Closed by requester" });
    } catch (e) {
      // An incomplete legacy request stays a draft; the owner can finish it in the wizard.
      if (!(e instanceof TransitionError)) throw e;
    }
  }
  return id;
}

/** Maps the legacy open/paused/closed field onto lifecycle events. Returns the new status if it changed. */
export async function applyLegacyStatus(id: string, current: string, wanted: string | undefined, userId: string): Promise<string | null> {
  if (!wanted || wanted === current) return null;
  let event: RequestEvent | null = null;
  if (wanted === "paused") event = "pause";
  else if (wanted === "closed") event = "cancel";
  else if (wanted === "open") event = current === "draft" ? "publish" : current === "paused" ? "resume" : null;
  if (!event) return null;
  try {
    const r = await transitionRequest(id, event, { userId, kind: "user" }, { reason: event === "cancel" ? "Closed by requester" : null });
    return r.to;
  } catch (e) {
    if (e instanceof TransitionError) return null;
    throw e;
  }
}
