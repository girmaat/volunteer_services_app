"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import styles from "../org.module.css";

// Keep this type colocated so this client component does not depend on
// server component exports (which are fragile across refactors).
export type OrgRequestRow = {
  id: string;
  title: string | null;
  status: string;
  updated_at: string;
  location_text?: string | null;
  applications_pending?: number | null;
  applications_total?: number | null;
};

function formatDate(s: string) {
  try {
    return new Date(s).toLocaleString();
  } catch {
    return s;
  }
}

const statuses = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "paused", label: "Paused" },
  { key: "closed", label: "Closed" }
] as const;

export default function OrgRequestsClient({ requests }: { requests: OrgRequestRow[] }) {
  const [status, setStatus] = useState<(typeof statuses)[number]["key"]>("all");
  const [q, setQ] = useState<string>("");

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return (requests || []).filter((r) => {
      if (status !== "all" && String(r.status).toLowerCase() !== status) return false;
      if (!query) return true;
      const hay = `${r.title || ""}`.toLowerCase();
      return hay.includes(query);
    });
  }, [requests, status, q]);

  return (
    <div className={styles.stack}>
      <div className={styles.headerRow}>
        <div>
          <h2 style={{ margin: 0 }}>Org requests</h2>
          <p className={styles.meta} style={{ marginTop: 6, marginBottom: 0 }}>
            Create and manage requests posted under your organization.
          </p>
        </div>
        <div className={styles.actions}>
          <Link className={styles.primaryButtonLink} href="/org/requests/new">
            Create request
          </Link>
        </div>
      </div>

      <div className={styles.filterBar}>
        <div className={styles.pillRow}>
          {statuses.map((s) => (
            <button
              type="button"
              key={s.key}
              onClick={() => setStatus(s.key)}
              className={`${styles.pill} ${status === s.key ? styles.pillActive : ""}`.trim()}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className={styles.searchWrap}>
          <label className={styles.label} htmlFor="q">
            Search
          </label>
          <input
            id="q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className={styles.input}
            placeholder="Search by title"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className={styles.card}>
          <p className={styles.muted} style={{ margin: 0 }}>
            {requests.length === 0
              ? "No requests yet. Create one to start receiving applications."
              : "No matching requests. Try a different status or search term."}
          </p>
        </div>
      ) : (
        <div className={styles.card}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th>Pending</th>
                <th>Total</th>
                <th>Updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/org/requests/${r.id}`}>{r.title}</Link>
                    {r.location_text ? <div className={styles.meta}>{r.location_text}</div> : null}
                  </td>
                  <td>{r.status}</td>
                  <td>{Number(r.applications_pending ?? 0)}</td>
                  <td>{Number(r.applications_total ?? 0)}</td>
                  <td>{formatDate(r.updated_at)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <Link className={styles.smallLink} href={`/org/requests/${r.id}`}>
                      View
                    </Link>
                    {" · "}
                    <Link className={styles.smallLink} href={`/org/requests/${r.id}/edit`}>
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
