"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Re-renders the inbox when something happens: Server-Sent Events first, polling every 10 s if the
 * stream isn't available (proxies that buffer, old browsers).
 */
export default function LiveRefresh({ conversationId }: { conversationId?: string }) {
  const router = useRouter();
  useEffect(() => {
    let poll: ReturnType<typeof setInterval> | null = null;
    let es: EventSource | null = null;
    const startPolling = () => {
      if (!poll) poll = setInterval(() => router.refresh(), 10_000);
    };
    if (typeof EventSource === "undefined") startPolling();
    else {
      es = new EventSource("/api/inbox/stream");
      const onEvent = (e: MessageEvent) => {
        try {
          const d = JSON.parse(e.data) as { conversationId: string };
          if (!conversationId || d.conversationId === conversationId) router.refresh();
          else router.refresh();
        } catch {
          router.refresh();
        }
      };
      es.addEventListener("message", onEvent as EventListener);
      es.addEventListener("conversation", onEvent as EventListener);
      es.onerror = () => {
        // Falls back to polling while the browser keeps retrying the stream.
        startPolling();
      };
      es.onopen = () => {
        if (poll) {
          clearInterval(poll);
          poll = null;
        }
      };
    }
    return () => {
      es?.close();
      if (poll) clearInterval(poll);
    };
  }, [router, conversationId]);
  return null;
}
