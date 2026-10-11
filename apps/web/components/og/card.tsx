/* eslint-disable @next/next/no-img-element -- ImageResponse renders plain elements */
// Shared layout for Open Graph images (rendered by next/og, so inline styles are required here).
export const OG_SIZE = { width: 1200, height: 630 };

const MARK =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M14 6h36a8 8 0 0 1 8 8v28a8 8 0 0 1-8 8H30l-12 9v-9h-4a8 8 0 0 1-8-8V14a8 8 0 0 1 8-8z" fill="#0f6e66"/><path d="M32 41s-11-6.6-11-13.4c0-3.6 2.8-6.1 6-6.1 2.2 0 3.9 1.2 5 2.8 1.1-1.6 2.8-2.8 5-2.8 3.2 0 6 2.5 6 6.1C43 34.4 32 41 32 41z" fill="#fff"/><circle cx="49" cy="15" r="5" fill="#f2b630"/></svg>`
  );

export function OgCard({ eyebrow, title, footer }: { eyebrow: string; title: string; footer: string }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#fafaf8", padding: 72, color: "#17242f", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <img src={MARK} width={64} height={64} alt="" />
        <span style={{ fontSize: 34, fontWeight: 700 }}>ThankYou</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <span style={{ fontSize: 28, color: "#0f6e66", fontWeight: 600 }}>{eyebrow}</span>
        <span style={{ fontSize: title.length > 60 ? 54 : 66, fontWeight: 700, lineHeight: 1.1, letterSpacing: -1 }}>{title}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 26, color: "#5a6772" }}>
        <div style={{ width: 40, height: 6, borderRadius: 3, background: "#f2b630" }} />
        {footer}
      </div>
    </div>
  );
}
