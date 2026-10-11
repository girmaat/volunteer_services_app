export type ConversationListItem = {
  id: string;
  kind: string;
  status: "active" | "ended" | "archived";
  request_id: string | null;
  request_title: string | null;
  with_name: string;
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
};
