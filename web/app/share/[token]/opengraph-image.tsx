import { ImageResponse } from "next/og";
import { headers } from "next/headers";

export const runtime = "edge";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

type SharePreview = {
  title?: string;
  summary?: string;
  verification_status?: string | null;
  is_expired?: boolean;
  is_revoked?: boolean;
};

export default async function Image({ params }: { params: { token: string } }) {
  const token = String(params.token || "");

  let preview: SharePreview = {};
  try {
    const h = headers();
    const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
    const proto = h.get("x-forwarded-proto") || "http";
    const base = `${proto}://${host}`;
    const res = await fetch(`${base}/v1/shares/${encodeURIComponent(token)}`, { cache: "no-store" });
    if (res.ok) preview = (await res.json()) as SharePreview;
  } catch {
    // ignore
  }

  const title = String(preview.title || "ThankYou shared link");
  const summaryRaw = String(preview.summary || "Open to view details.");
  const summary = summaryRaw.length > 140 ? summaryRaw.slice(0, 140) + "…" : summaryRaw;

  const verified = String(preview.verification_status || "") === "verified";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: 64,
          background: "linear-gradient(135deg, #0b1020 0%, #111a33 60%, #0b1020 100%)",
          color: "white",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: "rgba(255,255,255,0.10)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
                fontWeight: 800,
              }}
            >
              TY
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, opacity: 0.95 }}>ThankYou</div>
          </div>

          {verified ? (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.18)",
                background: "rgba(255,255,255,0.06)",
                fontSize: 16,
                fontWeight: 600,
              }}
            >
              Verified org
            </div>
          ) : null}
        </div>

        <div style={{ marginTop: 56, display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 56, fontWeight: 800, lineHeight: 1.1 }}>{title}</div>
          <div style={{ fontSize: 22, opacity: 0.85, lineHeight: 1.4, maxWidth: 960 }}>{summary}</div>
        </div>

        <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", opacity: 0.75 }}>
          <div style={{ fontSize: 18 }}>Preview link</div>
          <div style={{ fontSize: 18 }}>thankyou.app</div>
        </div>
      </div>
    ),
    size
  );
}
