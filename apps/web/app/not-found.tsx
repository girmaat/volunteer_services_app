import Link from "next/link";

export default function NotFound() {
  return (
    <div className="edgeShell">
      <div className="edgeCard">
        <h1 className="edgeTitle">Page not found</h1>
        <p className="edgeSubtitle">
          We couldn&apos;t find that page. It may have been moved or deleted.
        </p>
        <div className="edgeActions">
          <Link className="btn" href="/">Go home</Link>
          <Link className="btn btnSoft" href="/dashboard">Dashboard</Link>
        </div>
      </div>
    </div>
  );
}
