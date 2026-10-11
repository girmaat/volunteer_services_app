"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import QrCode from "./QrCode";
import styles from "./ShareModal.module.css";
import type { ShareTarget } from "./ShareButton";

type ShareSettings = {
  visibility: "link_only" | "public" | "logged_in_only" | "private";
  expires: "7" | "30" | "0";
};

type ShareResult =
  | { ok: true; shareUrl: string; token: string; visibility: string; expiresAt: string | null }
  | { ok: false; message: string };

type Props = {
  open: boolean;
  onClose: () => void;
  target: ShareTarget;
  settings: ShareSettings;
  onSettingsChange: (next: ShareSettings) => void;
  result: ShareResult | null;
  onMint: (next: ShareSettings, opts?: { forceNew?: boolean }) => Promise<ShareResult>;
  onLogEvent: (token: string, event_type: string) => Promise<void> | void;
};

function encodeURIComponentSafe(v: string) {
  return encodeURIComponent(v).replace(/%20/g, "+");
}

function buildActions(url: string, title?: string) {
  const t = (title || "Shared from ThankYou").trim();
  const subject = encodeURIComponentSafe(t);
  const body = encodeURIComponentSafe(`${t}\n${url}`);

  return {
    sms: `sms:?&body=${body}`,
    email: `mailto:?subject=${subject}&body=${body}`,
    whatsapp: `https://wa.me/?text=${body}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    x: `https://twitter.com/intent/tweet?text=${encodeURIComponent(t)}&url=${encodeURIComponent(url)}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`
  };
}

export default function ShareModal({
  open,
  onClose,
  target,
  settings,
  onSettingsChange,
  result,
  onMint,
  onLogEvent
}: Props) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loggedModalOpen = useRef(false);

  const shareOk = result && result.ok;
  const shareUrl = shareOk ? result.shareUrl : "";
  const token = shareOk ? result.token : "";
  const actions = useMemo(() => (shareOk ? buildActions(shareUrl, target.title) : null), [shareOk, shareUrl, target.title]);

  useEffect(() => {
    if (!open) return;
    setError(null);

    loggedModalOpen.current = false;

    // Auto-mint on open if we don't have a link yet.
    if (!shareOk && !working) {
      void (async () => {
        setWorking(true);
        try {
          const r = await onMint(settings);
          if (!r.ok) setError(r.message || "Could not generate a share link.");
        } catch (e: any) {
          setError(e?.message ? String(e.message) : "Could not generate a share link.");
        } finally {
          setWorking(false);
        }
      })();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !shareOk) return;
    if (!loggedModalOpen.current) {
      loggedModalOpen.current = true;
      // Backend supports a limited event enum; treat modal open as a "view".
      void onLogEvent(token, "view");
    }
  }, [open, shareOk, token]);

  async function copyLink() {
    if (!shareOk) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setError(null);
      void onLogEvent(token, "copy");
    } catch {
      setError("Could not copy link. Please copy manually.");
    }
  }

  async function refreshLink() {
    if (working) return;
    setWorking(true);
    try {
      const r = await onMint(settings, { forceNew: true });
      if (!r.ok) setError(r.message || "Could not generate a share link.");
      else setError(null);
    } catch (e: any) {
      setError(e?.message ? String(e.message) : "Could not generate a share link.");
    } finally {
      setWorking(false);
    }
  }

  function trackAndOpen(eventType: string, href: string) {
    if (!shareOk) return;
    void onLogEvent(token, eventType);
    window.open(href, "_blank", "noopener,noreferrer");
  }

  if (!open) return null;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <div className={styles.modal}>
        <div className={styles.header}>
          <h3 className={styles.title}>Share</h3>
          <button className={styles.close} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className={styles.section}>
          <div className={styles.row}>
            <label className={styles.label}>Who can view</label>
            <select
              className={styles.select}
              value={settings.visibility}
              onChange={(e) => onSettingsChange({ ...settings, visibility: e.target.value as any })}
            >
              <option value="link_only">Anyone with link</option>
              <option value="logged_in_only">Logged-in users</option>
              <option value="private">Only me</option>
            </select>
          </div>

          <div className={styles.row}>
            <label className={styles.label}>Expiry</label>
            <select
              className={styles.select}
              value={settings.expires}
              onChange={(e) => onSettingsChange({ ...settings, expires: e.target.value as any })}
            >
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="0">No expiry</option>
            </select>
          </div>

          <div className={styles.actionsRow}>
            <button className={styles.secondaryButton} onClick={refreshLink} disabled={working}>
              {working ? "Generating…" : shareOk ? "Update link" : "Generate link"}
            </button>
          </div>
        </div>

        <div className={styles.section}>
          <label className={styles.label}>Link</label>
          <div className={styles.linkRow}>
            <input className={styles.input} readOnly value={shareUrl || (working ? "Generating link…" : "")} />
            <button className={styles.button} onClick={copyLink} disabled={!shareOk}>
              Copy
            </button>
          </div>

          {error ? <p className={styles.error}>{error}</p> : null}
        </div>

        <div className={styles.section}>
          <label className={styles.label}>Share via</label>

          <div className={styles.grid}>
            <button className={styles.tile} onClick={() => shareOk && trackAndOpen("sms", actions!.sms)} disabled={!shareOk} type="button">
              Text / SMS
            </button>
            <button className={styles.tile} onClick={() => shareOk && trackAndOpen("email", actions!.email)} disabled={!shareOk} type="button">
              Email
            </button>
            <button
              className={styles.tile}
              onClick={() => shareOk && trackAndOpen("whatsapp", actions!.whatsapp)}
              disabled={!shareOk}
              type="button"
            >
              WhatsApp
            </button>
            <button
              className={styles.tile}
              onClick={() => shareOk && trackAndOpen("facebook", actions!.facebook)}
              disabled={!shareOk}
              type="button"
            >
              Facebook
            </button>
            <button className={styles.tile} onClick={() => shareOk && trackAndOpen("x", actions!.x)} disabled={!shareOk} type="button">
              X / Twitter
            </button>
            <button
              className={styles.tile}
              onClick={() => shareOk && trackAndOpen("linkedin", actions!.linkedin)}
              disabled={!shareOk}
              type="button"
            >
              LinkedIn
            </button>
          </div>
        </div>

        <div className={styles.section}>
          <label className={styles.label}>QR code</label>
          <div className={styles.qrRow}>
            {shareOk ? <QrCode text={shareUrl} size={200} className={styles.qr} /> : <div className={styles.qrPlaceholder} />}
            <p className={styles.muted}>Scan to open the link on another device.</p>
          </div>
        </div>

        <div className={styles.footer}>
          <button className={styles.secondaryButton} onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}


