import Link from "next/link";

import { requireDashboardAdmin } from "@/server/adminAuth";

export default async function DashboardLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  await requireDashboardAdmin();

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Dashboard navigation">
        <p className="brand">Agentic Tuslah</p>
        <nav>
          <ul className="nav-list">
            <li>
              <Link className="nav-link" href="/dashboard/api-gateway">
                API Gateway
              </Link>
            </li>
          </ul>
        </nav>
        <form action="/api/admin/logout" method="post">
          <button className="nav-link logout-button" type="submit">
            Гарах
          </button>
        </form>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
