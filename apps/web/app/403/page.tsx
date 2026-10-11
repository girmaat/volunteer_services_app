import Link from "next/link";

export const dynamic = "force-dynamic";

export default function AccessDenied() {
  return (
    <div className="edgeShell">
      <div className="edgeCard">
        <h1 className="edgeTitle">Access denied</h1>
        <p className="edgeSubtitle">
          You don&apos;t have permission to view this page.
        </p>
        <div className="edgeActions">
          <Link className="btn" href="/">Go home</Link>
          <Link className="btn btnSoft" href="/dashboard">Dashboard</Link>
          <Link className="btn btnSoft" href="/login">Log in</Link>
        </div>
      </div>
    </div>
  );
}
