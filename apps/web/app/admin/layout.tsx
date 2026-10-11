import { getCurrentUser } from "../lib/backend";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import AdminSidebarNav from "./AdminSidebarNav";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (!user?.is_platform_admin) {
    redirect("/403");
  }

  return (
    <div className="adminShell">
      <aside className="adminSidebar">
        <div style={{ display: "grid", gap: 10 }}>
          <div>
            <div style={{ fontWeight: 900 }}>Admin Console</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              {user.email}
              {user.platform_admin_role ? ` · ${user.platform_admin_role}` : ""}
            </div>
          </div>

          <nav className="adminNav">
            <AdminSidebarNav />
          </nav>
        </div>
      </aside>
      <section className="adminContent">{children}</section>
    </div>
  );
}
