import Link from "next/link";

const menuItems = [
  { href: "/dashboard/api-gateway", label: "Хяналтын самбар" },
  { href: "/dashboard/api-gateway/users", label: "Хэрэглэгчид" },
  { href: "/dashboard/api-gateway/models", label: "Моделиуд" },
  { href: "/dashboard/api-gateway/usage", label: "Хэрэглээний бүртгэл" },
  { href: "/dashboard/api-gateway/reports", label: "Тайлан" }
];

export default function ApiGatewayLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="gateway-admin">
      <div className="gateway-section-head">
        <div>
          <p>API Gateway</p>
          <h1>AI Gateway удирдлага</h1>
        </div>
      </div>
      <nav className="gateway-subnav" aria-label="API Gateway navigation">
        {menuItems.map((item) => (
          <Link href={item.href} key={item.href}>
            {item.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
