"use client";

import { useEffect, useId, useState } from "react";
import styles from "./page.module.css";

type Status = "idle" | "submitting" | "done" | "error";

export default function ReportThisLink({ token }: { token: string }) {
  const dialogTitleId = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("spam");
  const [details, setDetails] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  const busy = status === "submitting";
  const done = status === "done";

  function close() {
    if (busy) return;
    setOpen(false);
    setStatus("idle");
  }

  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, busy]);

  async function submit() {
    if (busy || done) return;
    setStatus("submitting");
    try {
      const res = await fetch(`/v1/shares/${encodeURIComponent(token)}/report`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason, details: details.trim() || undefined }),
      });
      if (!res.ok) throw new Error("bad_status");
      setStatus("done");
      setTimeout(() => {
        setDetails("");
      }, 400);
    } catch {
      setStatus("error");
    }
  }

  return (
    <>
      <button className={styles.reportBtn} type="button" onClick={() => setOpen(true)}>
        Report this link
      </button>

      {open ? (
        <div className={styles.modalBackdrop} onClick={close}>
          <div
            className={styles.modalCard}
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div className={styles.modalTitle} id={dialogTitleId}>
                Report this link
              </div>
              <button className={styles.modalClose} type="button" onClick={close} aria-label="Close" disabled={busy}>
                ×
              </button>
            </div>

            <div className={styles.modalSubtitle}>
              Help us keep the community safe. Reports are reviewed by moderators.
            </div>

            <fieldset className={styles.modalForm} disabled={busy || done}>
              <label className={styles.modalLabel}>
                Reason
                <select className={styles.modalSelect} value={reason} onChange={(e) => setReason(e.target.value)}>
                  <option value="spam">Spam</option>
                  <option value="harassment">Harassment</option>
                  <option value="scam">Scam / fraud</option>
                  <option value="privacy">Privacy concern</option>
                  <option value="other">Other</option>
                </select>
              </label>

              <label className={styles.modalLabel}>
                Details (optional)
                <textarea
                  className={styles.modalTextarea}
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="Add any context that helps moderators review the link."
                />
              </label>
            </fieldset>

            <div className={styles.modalActions}>
              <button className={styles.modalSecondary} type="button" onClick={close} disabled={busy}>
                {done ? "Close" : "Cancel"}
              </button>

              {!done ? (
                <button className={styles.modalPrimary} type="button" onClick={submit} disabled={busy}>
                  {busy ? "Sending…" : "Submit report"}
                </button>
              ) : null}
            </div>

            {status === "done" ? <div className={styles.modalSuccess}>Thanks — we&apos;ll review this.</div> : null}
            {status === "error" ? (
              <div className={styles.modalError}>Couldn&apos;t submit right now. Please try again.</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
