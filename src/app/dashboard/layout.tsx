import Link from "next/link";

export default function DashboardLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
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
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
