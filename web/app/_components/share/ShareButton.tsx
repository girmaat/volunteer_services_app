"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ShareModal from "./ShareModal";
import styles from "./ShareButton.module.css";

export type ShareTarget =
  | { type: "request"; ref: string; title?: string }
  | { type: "opportunity"; ref: string; title?: string }
  | { type: "org"; ref: string; title?: string }
  | { type: "impact"; ref: string; title?: string }
  | { type: "page"; ref: string; title?: string }
  | { type: "volunteer"; ref: string; title?: string }
  | { type: "invite"; ref: string; title?: string };

type Props = {
  target: ShareTarget;
  label?: string;
  className?: string;
};

type ShareSettings = {
  visibility: "link_only" | "public" | "logged_in_only" | "private";
  expires: "7" | "30" | "0";
};

type ShareResult =
  | { ok: true; shareUrl: string; token: string; visibility: string; expiresAt: string | null }
  | { ok: false; message: string; status?: number; reason?: "unauthenticated" | "onboarding_incomplete" | "other" };

type ShareBlockReason = "unauthenticated" | "onboarding_incomplete" | "other";

const SETTINGS_KEY = "ty_share_settings_v1";

function defaultSettings(): ShareSettings {
  return { visibility: "link_only", expires: "30" };
}

function loadSettings(): ShareSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings();
    const parsed = JSON.parse(raw) as any;
    const visibility = String(parsed?.visibility || "link_only") as ShareSettings["visibility"];
    const expires = String(parsed?.expires || "30") as ShareSettings["expires"];
    if (!(["link_only", "public", "logged_in_only", "private"] as const).includes(visibility)) return defaultSettings();
    if (!(["7", "30", "0"] as const).includes(expires)) return defaultSettings();
    return { visibility, expires };
  } catch {
    return defaultSettings();
  }
}

function saveSettings(s: ShareSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

function buildShareText(title?: string, url?: string) {
  const t = (title || "Shared from ThankYou").trim();
  const u = (url || "").trim();
  return u ? `${t}\n${u}` : t;
}

function classifyAuthBlock(status: number, message: string): ShareBlockReason {
  if (status === 401) return "unauthenticated";
  if (status === 403 && message.toLowerCase().includes("onboarding")) return "onboarding_incomplete";
  return "other";
}

export default function ShareButton({ target, label, className }: Props) {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<ShareSettings>(defaultSettings);
  const [result, setResult] = useState<ShareResult | null>(null);
  const [loading, setLoading] = useState(false);

  const mounted = useRef(false);

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    setSettings(loadSettings());
  }, []);

  const shareText = useMemo(
    () => buildShareText(target.title, result && result.ok ? result.shareUrl : ""),
    [target.title, result]
  );

  async function logEvent(token: string, event_type: string) {
    try {
      const payload = JSON.stringify({ event_type });
      if (navigator.sendBeacon) {
        navigator.sendBeacon(`/v1/shares/${encodeURIComponent(token)}/events`, new Blob([payload], { type: "application/json" }));
        return;
      }
      await fetch(`/v1/shares/${encodeURIComponent(token)}/events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: payload,
        keepalive: true
      });
    } catch {
      // ignore
    }
  }

  function isResultReusable(s: ShareSettings, r: ShareResult | null) {
    if (!r || !r.ok) return false;
    // If the user changes settings, we will mint a new link.
    // If expires_at is present and has passed, mint again.
    if (String(r.visibility) !== String(s.visibility)) return false;
    if (r.expiresAt) {
      const ts = Date.parse(r.expiresAt);
      if (Number.isFinite(ts) && ts <= Date.now()) return false;
    }
    return true;
  }

  async function mintShareLink(s: ShareSettings, opts?: { forceNew?: boolean }): Promise<ShareResult> {
    if (!opts?.forceNew && isResultReusable(s, result)) return result as any;

    // If the user explicitly asked to update/regenerate the link, revoke the current token first.
    // This bypasses backend deduping (which intentionally reuses active tokens) and makes "Update link" visibly change.
    if (opts?.forceNew && result && result.ok && result.token) {
      try {
        await fetch(`/v1/shares/${encodeURIComponent(result.token)}/revoke`, { method: "POST" });
      } catch {
        // ignore
      }
      setResult(null);
    }

    setLoading(true);
    try {
      const expires_in_days = s.expires === "0" ? undefined : Number(s.expires);
      const res = await fetch("/v1/shares", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          target_type: target.type,
          target_ref: target.ref,
          visibility: s.visibility,
          ...(typeof expires_in_days === "number" && Number.isFinite(expires_in_days) && expires_in_days > 0 ? { expires_in_days } : {})
        })
      });

      const body = (await res.json().catch(() => null)) as any;

      if (!res.ok) {
        const msg = body?.message ? String(body.message) : `HTTP ${res.status}`;
        return { ok: false, message: msg, status: res.status, reason: classifyAuthBlock(res.status, msg) };
      }

      const sharePath = String(body.share_path || body.sharePath || "");
      const token = String(body.token || "");
      if (!sharePath || !token) {
        return { ok: false, message: "Share link failed: unexpected server response", status: 502, reason: "other" };
      }

      const fullUrl = sharePath.startsWith("http") ? sharePath : `${window.location.origin}${sharePath}`;
      return {
        ok: true,
        shareUrl: fullUrl,
        token,
        visibility: String(body.visibility || s.visibility),
        expiresAt: body.expires_at || body.expiresAt || null
      };
    } catch (e: any) {
      return { ok: false, message: e?.message ? String(e.message) : "Failed to create share link", reason: "other" };
    } finally {
      setLoading(false);
    }
  }

  async function handleClick() {
    const s = settings;
    saveSettings(s);

    const minted = await mintShareLink(s);
    setResult(minted);

    // Auth/onboarding gating: redirect instead of opening the Share modal.
    if (!minted.ok) {
      if (minted.reason === "unauthenticated") {
        window.location.href = "/login";
        return;
      }
      if (minted.reason === "onboarding_incomplete") {
        window.location.href = "/onboarding";
        return;
      }
      // Non-auth failures: show the modal so user can see the error and retry.
      setOpen(true);
      return;
    }

    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try {
        await (navigator as any).share({
          title: target.title || "Shared from ThankYou",
          text: shareText,
          url: minted.shareUrl
        });
        void logEvent(minted.token, "native_share");
        return;
      } catch {
        // If user cancels / share fails, fall back to the modal.
      }
    }

    setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        className={`${styles.button} ${className || ""}`.trim()}
        onClick={handleClick}
        disabled={loading}
      >
        {loading ? "Sharing…" : label || "Share"}
      </button>

      <ShareModal
        open={open}
        onClose={() => setOpen(false)}
        target={target}
        settings={settings}
        onSettingsChange={(next) => {
          setSettings(next);
          saveSettings(next);
          // Mark result stale if settings changed so the next mint uses the new rules.
          if (result && result.ok && String(result.visibility) !== String(next.visibility)) setResult(null);
          if (next.expires !== settings.expires) setResult(null);
        }}
        result={result}
        onMint={async (next, opts) => {
          const r = await mintShareLink(next, opts);
          setResult(r);
          // If user somehow triggers mint while unauth/onboarding incomplete, route them correctly.
          if (!r.ok && r.reason === "unauthenticated") window.location.href = "/login";
          if (!r.ok && r.reason === "onboarding_incomplete") window.location.href = "/onboarding";
          return r as any;
        }}
        onLogEvent={logEvent}
      />
    </>
  );
}




