"use client";

import { useCallback, useState } from "react";
import styles from "../../volunteer.module.css";
import OpportunityCard, { type OpportunityListItem } from "../_components/OpportunityCard";

export default function SavedOpportunitiesClient({ initial }: { initial: OpportunityListItem[] }) {
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const unsave = useCallback(async (id: string) => {
    if (!id || busy) return;
    setBusy(id);
    setError(null);

    const res = await fetch(`/api/volunteer/opportunities/${id}/save`, {
      method: "DELETE",
      cache: "no-store"
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null) as any;
      setError(data?.message || "Failed to unsave.");
      setBusy(null);
      return;
    }

    setItems((prev) => prev.filter((o) => o.id !== id));
    setBusy(null);
  }, [busy]);

  return (
    <>
      {error ? (
        <div className={`${styles.banner} ${styles.bannerError}`}>
          <p className={styles.bannerTitle}>Could not unsave</p>
          <p className={styles.bannerBody}>{error}</p>
        </div>
      ) : null}

      <div className={styles.grid}>
        {items.map((o) => (
          <OpportunityCard
            key={o.id}
            opportunity={o}
            showUnsave
            unsaveBusy={busy === o.id}
            onUnsave={unsave}
          />
        ))}
      </div>
    </>
  );
}
