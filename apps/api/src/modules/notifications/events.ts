/**
 * Notification events (queued jobs). Each handler loads what it needs, then calls `notify`.
 * Safety copy is part of every message that leads to an in-person meeting.
 */
import { pool } from "../../lib/db";
import { notify, notifyModerators, requestOwnerIds } from "./service";

const SAFETY = "Stay on ThankYou to coordinate. Never share bank details, passwords or money. Meet in public for the first time when you can.";

async function requestInfo(requestId: string) {
  const r = await pool.query(
    "SELECT id, title, requester_org_slug, requester_user_id, cancel_reason, review_notes, volunteers_needed FROM service_requests WHERE id = $1",
    [requestId]
  );
  return r.rows[0] as
    | { id: string; title: string; requester_org_slug: string | null; requester_user_id: string; cancel_reason: string | null; review_notes: string | null; volunteers_needed: number }
    | undefined;
}

const ownerPath = (r: { id: string; requester_org_slug: string | null }, suffix = "") =>
  r.requester_org_slug ? `/org/requests/${r.id}${suffix}` : `/requester/requests/${r.id}${suffix}`;

async function applicationInfo(applicationId: string) {
  const r = await pool.query(
    `SELECT a.id, a.status, a.volunteer_user_id, a.request_id,
            COALESCE(NULLIF(p.display_name, ''), 'A volunteer') AS volunteer_name
       FROM request_applications a LEFT JOIN user_profiles p ON p.user_id = a.volunteer_user_id
      WHERE a.id = $1`,
    [applicationId]
  );
  return r.rows[0] as { id: string; status: string; volunteer_user_id: string; request_id: string; volunteer_name: string } | undefined;
}

export async function onApplicationReceived({ applicationId }: { applicationId: string }) {
  const a = await applicationInfo(applicationId);
  if (!a) return;
  const req = await requestInfo(a.request_id);
  if (!req) return;
  for (const owner of await requestOwnerIds(req.id)) {
    await notify(owner, "application_received", {
      title: `${a.volunteer_name} applied to “${req.title}”`,
      href: ownerPath(req, "/applications"),
      data: { applicationId, requestId: req.id },
      email: {
        subject: `New applicant for “${req.title}”`,
        heading: `${a.volunteer_name} wants to help`,
        lines: [`${a.volunteer_name} applied to “${req.title}”. Review their profile and accept, waitlist or decline.`],
        cta: { label: "Review applicant", url: ownerPath(req, "/applications") }
      }
    });
  }
}

const STATUS_COPY: Record<string, { title: (t: string) => string; line: (t: string) => string }> = {
  accepted: { title: (t) => `You're in: “${t}”`, line: (t) => `Your application to “${t}” was accepted. The exact location and contact details are now in your application.` },
  waitlisted: { title: (t) => `You're on the waitlist for “${t}”`, line: (t) => `“${t}” is full for now. If a spot opens you'll move up automatically and we'll let you know.` },
  rejected: { title: (t) => `Update on “${t}”`, line: (t) => `The organizer chose other volunteers for “${t}”. Thank you for offering — there are more opportunities waiting.` },
  canceled: { title: (t) => `“${t}” was canceled`, line: (t) => `“${t}” isn't going ahead.` }
};

export async function onApplicationStatus({ applicationId, status, promoted }: { applicationId: string; status: string; promoted?: boolean }) {
  const a = await applicationInfo(applicationId);
  const copy = STATUS_COPY[status];
  if (!a || !copy) return;
  const req = await requestInfo(a.request_id);
  if (!req) return;
  const lines = [copy.line(req.title)];
  if (promoted) lines.unshift("A spot opened up and you moved up from the waitlist.");
  await notify(a.volunteer_user_id, "application_status", {
    title: copy.title(req.title),
    href: `/volunteer/applications/${a.id}`,
    data: { applicationId, status, promoted: Boolean(promoted) },
    email: {
      subject: copy.title(req.title),
      heading: copy.title(req.title),
      lines,
      cta: { label: "Open your application", url: `/volunteer/applications/${a.id}` },
      note: status === "accepted" ? SAFETY : undefined
    }
  });
}

export async function onRequestCanceled({ requestId, reason, byAdmin }: { requestId: string; reason: string | null; byAdmin?: boolean }) {
  const req = await requestInfo(requestId);
  if (!req) return;
  const apps = await pool.query(
    `SELECT a.id, a.volunteer_user_id FROM request_applications a JOIN service_requests r ON r.id = a.request_id
      WHERE a.request_id = $1 AND a.status = 'canceled' AND a.status_updated_at >= r.canceled_at - INTERVAL '1 minute'`,
    [requestId]
  );
  for (const a of apps.rows) {
    await notify(String(a.volunteer_user_id), "application_status", {
      title: `“${req.title}” was canceled`,
      body: reason ?? "",
      href: `/volunteer/applications/${a.id}`,
      data: { requestId, reason },
      email: {
        subject: `“${req.title}” was canceled`,
        heading: `“${req.title}” was canceled`,
        lines: [reason ? `Reason given: ${reason}` : "The organizer canceled this request.", "Thank you for offering your time."],
        cta: { label: "Find another opportunity", url: "/volunteer/opportunities/recommended" }
      }
    });
  }
  if (byAdmin) {
    for (const owner of await requestOwnerIds(requestId)) {
      await notify(owner, "request_updates", {
        title: `“${req.title}” was removed by a moderator`,
        body: reason ?? "",
        href: ownerPath(req),
        email: {
          subject: `Your request “${req.title}” was removed`,
          heading: "A moderator removed your request",
          lines: [reason ? `Reason: ${reason}` : "It didn't meet the community guidelines.", "If you think this is a mistake, reply from the request page to open a dispute."],
          cta: { label: "View request", url: ownerPath(req) }
        }
      });
    }
  }
}

export async function onRequestNeedsReview({ requestId }: { requestId: string }) {
  const req = await requestInfo(requestId);
  if (!req) return;
  await notifyModerators("moderation", {
    title: `Review needed: “${req.title}”`,
    href: "/admin/moderation?tab=review",
    data: { requestId },
    email: {
      subject: `Review needed: “${req.title}”`,
      heading: "A sensitive request is waiting for review",
      lines: [`“${req.title}” is in a sensitive category and stays hidden until a moderator approves it.`],
      cta: { label: "Open the review queue", url: "/admin/moderation?tab=review" }
    }
  });
}

export async function onRequestReviewed({ requestId, approved, reason }: { requestId: string; approved: boolean; reason: string | null }) {
  const req = await requestInfo(requestId);
  if (!req) return;
  for (const owner of await requestOwnerIds(requestId)) {
    await notify(owner, "request_updates", {
      title: approved ? `“${req.title}” is live` : `“${req.title}” needs changes`,
      body: reason ?? "",
      href: ownerPath(req),
      email: {
        subject: approved ? `Your request “${req.title}” is live` : `Your request “${req.title}” needs changes`,
        heading: approved ? "Your request was approved" : "Your request wasn't approved yet",
        lines: approved
          ? ["A moderator approved your request. Verified volunteers can now find it and apply."]
          : [reason ? `Moderator note: ${reason}` : "A moderator asked for changes.", "Edit the request and submit it again."],
        cta: { label: "View request", url: ownerPath(req) }
      }
    });
  }
}

export async function onReviewRequested({ applicationId }: { applicationId: string }) {
  const a = await applicationInfo(applicationId);
  if (!a) return;
  const req = await requestInfo(a.request_id);
  if (!req) return;
  await notify(a.volunteer_user_id, "review_requested", {
    title: `How did “${req.title}” go?`,
    href: `/volunteer/applications/${a.id}#review`,
    email: {
      subject: `How did “${req.title}” go?`,
      heading: "Leave a quick review",
      lines: ["Reviews stay hidden until both of you submit (or 14 days pass), so you can be honest."],
      cta: { label: "Write a review", url: `/volunteer/applications/${a.id}#review` }
    }
  });
  for (const owner of await requestOwnerIds(req.id)) {
    await notify(owner, "review_requested", {
      title: `Review ${a.volunteer_name} for “${req.title}”`,
      href: ownerPath(req, "/applications"),
      email: {
        subject: `Review ${a.volunteer_name}`,
        heading: `How was ${a.volunteer_name}?`,
        lines: ["Reviews stay hidden until both of you submit (or 14 days pass), so you can be honest."],
        cta: { label: "Write a review", url: ownerPath(req, "/applications") }
      }
    });
  }
}

export async function onRequestFilled({ requestId }: { requestId: string }) {
  const req = await requestInfo(requestId);
  if (!req) return;
  for (const owner of await requestOwnerIds(requestId)) {
    await notify(owner, "request_updates", {
      title: `“${req.title}” is fully staffed`,
      href: ownerPath(req, "/applications"),
      email: {
        subject: `“${req.title}” is fully staffed`,
        heading: "All spots are filled",
        lines: [`You have ${req.volunteers_needed} volunteer${req.volunteers_needed === 1 ? "" : "s"} for “${req.title}”. New applicants go to the waitlist.`],
        cta: { label: "See your volunteers", url: ownerPath(req, "/applications") }
      }
    });
  }
}

/** Attendance reminders 48 h and 2 h before a confirmed commitment (scheduled every 15 minutes). */
export async function sendAttendanceReminders() {
  const windows = [
    { kind: "48h", from: "47 hours 45 minutes", to: "48 hours 15 minutes", label: "in 2 days" },
    { kind: "2h", from: "1 hour 45 minutes", to: "2 hours 15 minutes", label: "in about 2 hours" }
  ];
  let sent = 0;
  for (const w of windows) {
    const r = await pool.query(
      `SELECT c.id, c.volunteer_user_id, c.start_at, r.id AS request_id, r.title, a.id AS application_id
         FROM request_commitments c
         JOIN service_requests r ON r.id = c.request_id
         LEFT JOIN request_applications a ON a.request_id = c.request_id AND a.volunteer_user_id = c.volunteer_user_id
        WHERE c.status IN ('scheduled', 'confirmed')
          AND r.status NOT IN ('canceled', 'completed')
          AND c.start_at BETWEEN NOW() + $1::interval AND NOW() + $2::interval`,
      [w.from, w.to]
    );
    for (const c of r.rows) {
      const key = `reminder:${c.id}:${w.kind}`;
      const dup = await pool.query("SELECT 1 FROM notifications WHERE user_id = $1 AND type = 'attendance_reminder' AND data->>'key' = $2", [c.volunteer_user_id, key]);
      if (dup.rowCount) continue;
      await notify(String(c.volunteer_user_id), "attendance_reminder", {
        title: `“${c.title}” starts ${w.label}`,
        body: "Confirm you're still coming, or cancel so the organizer can find someone else.",
        href: `/volunteer/applications/${c.application_id}`,
        data: { key, commitmentId: c.id },
        email: {
          subject: `Reminder: “${c.title}” starts ${w.label}`,
          heading: `“${c.title}” starts ${w.label}`,
          lines: ["Please confirm you're still coming. If plans changed, cancel now so the organizer can find someone else — late cancellations show on your reliability."],
          cta: { label: "Confirm or cancel", url: `/volunteer/applications/${c.application_id}` },
          note: SAFETY,
          dedupeKey: key
        }
      });
      sent++;
    }
  }
  return sent;
}
