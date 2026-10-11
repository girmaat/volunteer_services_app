"use client";

import { useMemo, useState } from "react";
import styles from "./ShareModalTrigger.module.css";

type Props = {
  shareType: "PUBLIC_PAGE" | "IMPACT_STORY" | "ORGANIZATION" | "OPPORTUNITY" | "SERVICE_REQUEST";
  targetRef: string;
  title?: string;
};

type CreateResult =
  | { ok: true; shareUrl: string; token: string; visibility: string; expiresAt: string | null }
  | { ok: false; message: string; status?: number; reason?: "unauthenticated" | "onboarding_incomplete" | "other" };

type ShareBlockReason = "unauthenticated" | "onboarding_incomplete" | "other";

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

export default function ShareModalTrigger({ shareType, targetRef, title }: Props) {
  const [open, setOpen] = useState(false);
  const [visibility, setVisibility] = useState<"link_only" | "public" | "logged_in_only" | "private">("link_only");
  const [expires, setExpires] = useState<"7" | "30" | "0">("30");
  const [loading, setLoading] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [result, setResult] = useState<CreateResult | null>(null);

  const shareText = useMemo(() => buildShareText(title, result && result.ok ? result.shareUrl : ""), [title, result]);

  async function createLink(): Promise<CreateResult> {
    setLoading(true);
    setResult(null);
    try {
      const expires_in_days = expires === "0" ? undefined : Number(expires);
      const res = await fetch("/api/share/links", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          share_type: shareType,
          target_ref: targetRef,
          visibility,
          ...(typeof expires_in_days === "number" && Number.isFinite(expires_in_days) && expires_in_days > 0 ? { expires_in_days } : {})
        })
      });

      const body = (await res.json().catch(() => null)) as any;

      if (!res.ok) {
        const msg = body?.message ? String(body.message) : `HTTP ${res.status}`;
        return { ok: false, message: msg, status: res.status, reason: classifyAuthBlock(res.status, msg) };
      }

      const sharePath = String(body.share_path || "");
      const token = String(body.token || "");
      if (!sharePath || !token) {
        return { ok: false, message: "Share link failed: unexpected server response", status: 502, reason: "other" };
      }

      const fullUrl = `${window.location.origin}${sharePath}`;
      return { ok: true, shareUrl: fullUrl, token, visibility: String(body.visibility || visibility), expiresAt: body.expires_at || null };
    } catch (e: any) {
      return { ok: false, message: e?.message ? String(e.message) : "Failed to create share link", reason: "other" };
    } finally {
      setLoading(false);
    }
  }

  async function openShare() {
    // Expected behavior: unauth / onboarding-incomplete users should be redirected,
    // not shown the Share modal.
    setPreparing(true);
    try {
      const r = await createLink();
      if (!r.ok && r.reason === "unauthenticated") {
        window.location.href = "/login";
        return;
      }
      if (!r.ok && r.reason === "onboarding_incomplete") {
        window.location.href = "/onboarding";
        return;
      }

      setResult(r);
      setOpen(true);
    } finally {
      setPreparing(false);
    }
  }

  async function copyLink() {
    if (!result || !result.ok) return;
    try {
      await navigator.clipboard.writeText(result.shareUrl);
      void fetch("/api/share/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: result.token, event_type: "copy" })
      });
    } catch {
      // ignore
    }
  }

  function close() {
    setOpen(false);
  }

  return (
    <>
      <button className={styles.trigger} onClick={openShare} type="button" disabled={preparing || loading}>
        {preparing ? "Checking…" : "Share"}
      </button>

      {open ? (
        <div className={styles.overlay} role="dialog" aria-modal="true">
          <div className={styles.modal}>
            <div className={styles.header}>
              <h2 className={styles.title}>Share</h2>
              <button className={styles.close} onClick={close} type="button" aria-label="Close">
                ×
              </button>
            </div>

            <div className={styles.body}>
              <div className={styles.row}>
                <label className={styles.label}>Who can view</label>
                <select className={styles.select} value={visibility} onChange={(e) => setVisibility(e.target.value as any)}>
                  <option value="link_only">Anyone with the link</option>
                  <option value="public">Public</option>
                  <option value="logged_in_only">Any logged-in user</option>
                  <option value="private">Only me (private)</option>
                </select>
              </div>

              <div className={styles.row}>
                <label className={styles.label}>Link expires</label>
                <select className={styles.select} value={expires} onChange={(e) => setExpires(e.target.value as any)}>
                  <option value="7">7 days</option>
                  <option value="30">30 days</option>
                  <option value="0">Never</option>
                </select>
              </div>

              <div className={styles.actions}>
                <button
                  className={styles.primary}
                  onClick={async () => {
                    const r = await createLink();
                    if (!r.ok && r.reason === "unauthenticated") {
                      window.location.href = "/login";
                      return;
                    }
                    if (!r.ok && r.reason === "onboarding_incomplete") {
                      window.location.href = "/onboarding";
                      return;
                    }
                    setResult(r);
                  }}
                  disabled={loading}
                  type="button"
                >
                  {loading ? "Generating…" : "Generate link"}
                </button>
              </div>

              {result ? (
                result.ok ? (
                  <div className={styles.result}>
                    <div className={styles.shareUrl}>{result.shareUrl}</div>

                    <div className={styles.actionsInline}>
                      <button className={styles.secondary} onClick={copyLink} type="button">
                        Copy link
                      </button>
                      <a className={styles.secondary} href={`mailto:?subject=${encodeURIComponent(title || "Shared from ThankYou")}&body=${encodeURIComponent(shareText)}`}>
                        Email
                      </a>
                      <a className={styles.secondary} href={`sms:?&body=${encodeURIComponent(shareText)}`}>
                        SMS
                      </a>
                      <a className={styles.secondary} target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}>
                        WhatsApp
                      </a>
                      <a className={styles.secondary} target="_blank" rel="noreferrer" href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(result.shareUrl)}`}>
                        LinkedIn
                      </a>
                      <a className={styles.secondary} target="_blank" rel="noreferrer" href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(result.shareUrl)}`}>
                        Facebook
                      </a>
                      <a className={styles.secondary} target="_blank" rel="noreferrer" href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(title || "")}&url=${encodeURIComponent(result.shareUrl)}`}>
                        X
                      </a>
                    </div>

                    <div className={styles.privacy}>
                      <h3 className={styles.privacyTitle}>Privacy & safety</h3>
                      <ul className={styles.privacyList}>
                        <li>Shared links should not include phone numbers, email addresses, or full street addresses.</li>
                        <li>Use coarse locations publicly; share detailed info only after confirming participation.</li>
                        <li>If a link was shared accidentally, set it to expire quickly or create a private link.</li>
                      </ul>
                    </div>
                  </div>
                ) : (
                  <div className={styles.error}>{result.message}</div>
                )
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
