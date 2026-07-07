"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const menuItems = [
  { href: "/dashboard/api-gateway", label: "Хяналтын самбар" },
  { href: "/dashboard/api-gateway/users", label: "Хэрэглэгчид" },
  { href: "/dashboard/api-gateway/keys", label: "API түлхүүр" },
  { href: "/dashboard/api-gateway/models", label: "Моделиуд" },
  { href: "/dashboard/api-gateway/credits", label: "Гүйлгээ" },
  { href: "/dashboard/api-gateway/usage", label: "Хэрэглээний бүртгэл" },
  { href: "/dashboard/api-gateway/generations", label: "Бүтээлүүд" },
  { href: "/dashboard/api-gateway/reports", label: "Тайлан" }
];

function isActive(pathname: string | null, href: string) {
  if (href === "/dashboard/api-gateway") {
    return pathname === href;
  }

  return pathname === href || (pathname?.startsWith(`${href}/`) ?? false);
}

export function GatewaySubnav() {
  const pathname = usePathname();

  return (
    <nav className="gateway-subnav" aria-label="API Gateway navigation">
      {menuItems.map((item) => (
        <Link
          href={item.href}
          key={item.href}
          className={isActive(pathname, item.href) ? "active" : ""}
          aria-current={isActive(pathname, item.href) ? "page" : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
