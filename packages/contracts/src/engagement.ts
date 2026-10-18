import { z } from "zod";

// ---- Discovery (GET /v1/discovery/opportunities) -----------------------------------------------
export type MatchInfo = { score: number; reasons: string[]; warnings: string[] };
export type DiscoveryItem = {
  id: string;
  title: string;
  summary: string;
  category: string;
  category_label: string;
  mode: "in-person" | "remote" | "hybrid";
  public_area: string | null;
  starts_at: string | null;
  ends_at: string | null;
  schedule_type: string | null;
  recurrence_rule: string | null;
  timezone: string | null;
  duration_minutes: number | null;
  apply_by: string | null;
  volunteers_needed: number;
  spots_left: number;
  status: string;
  urgency: string;
  required_skills: string[];
  nice_to_have_skills: string[];
  is_sensitive: boolean;
  organization_name: string | null;
  organization_slug: string | null;
  organization_verified: boolean;
  posted_by: string | null;
  distance_miles: number | null;
  match: MatchInfo | null;
  published_at: string | null;
};
export type DiscoveryPage = { items: DiscoveryItem[]; nextCursor: string | null; needsLocation: boolean; viewer: { timezone: string | null; radius: number; hasLocation: boolean } | null };

// ---- Inbox (/v1/inbox) -------------------------------------------------------------------------
export const SendMessageBody = z.object({ body: z.string().trim().min(1).max(5000) });
export const ReportBody = z.object({
  category: z.enum(["harassment", "scam", "safety", "spam", "inappropriate", "other"]),
  details: z.string().trim().max(4000).optional(),
  messageId: z.string().uuid().optional()
});
export type ConversationListItem = {
  id: string;
  kind: string;
  status: "active" | "ended" | "archived";
  request_id: string | null;
  request_title: string | null;
  with_name: string;
  with_avatar_url?: string | null;
  as: "volunteer" | "owner";
  application_status: string | null;
  contacts_unlocked: boolean;
  last_message_at: string | null;
  last_body: string | null;
  unread: number;
};
export type ThreadMessage = {
  id: string;
  mine: boolean;
  sender_name: string;
  body: string;
  status: "sent" | "held" | "rejected";
  held_reason: string | null;
  attachment: { id: string; name: string; type: string; size: number } | null;
  created_at: string;
};
export type ThreadConversation = {
  id: string;
  status: "active" | "ended" | "archived";
  request_id: string | null;
  request_title: string | null;
  request_status: string | null;
  application_id: string | null;
  application_status: string | null;
  as: "volunteer" | "owner";
  with_name: string;
  contacts_unlocked: boolean;
  can_send: boolean;
  kind?: "request" | "direct" | "support";
  /** Volunteers reply only: true until the organizer or requester sends the first message. */
  waiting_for_organizer?: boolean;
  reply_only_message?: string | null;
};

// ---- Reviews (/v1/reviews) ---------------------------------------------------------------------
const star = z.coerce.number().int().min(1).max(5);
export const ReviewBody = z.object({
  applicationId: z.string().uuid(),
  overall: star,
  reliability: star.optional().nullable(),
  communication: star.optional().nullable(),
  clarity: star.optional().nullable(),
  skill: star.optional().nullable(),
  comment: z.string().trim().max(2000).optional().nullable(),
  wouldWorkAgain: z.boolean().optional().nullable()
});
export type ReviewBody = z.infer<typeof ReviewBody>;
export type ReviewState = {
  side: "volunteer" | "owner";
  can_review: boolean;
  mine: Record<string, unknown> | null;
  theirs: { overall: number; reliability: number | null; communication: number | null; skill?: number | null; clarity?: number | null; comment: string | null; would_work_again: boolean | null } | null;
  theirs_submitted: boolean;
  reveal_at: string | null;
};
export type Reliability = { completed: number; late_cancels: number; no_shows: number; rate: number | null };

// ---- Notifications ----------------------------------------------------------------------------
export type NotificationItem = { id: string; type: string; title: string; body: string; href: string | null; created_at: string; read_at: string | null };
export type NotificationPreference = { type: string; label: string; email: boolean; in_app: boolean };
